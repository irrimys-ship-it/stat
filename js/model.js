// Предметная логика: расписание, задачи, быстрый ввод, вложения.

import * as db from './store.js';
import { DEFAULT_SETTINGS } from './seed.js';
import { addDays, addMonths, diffDays, dueMs, mondayOf, nowTime, parseISO, toMin, today, weekday, iso } from './date.js';

// ---------- Настройки ----------

export function settings() {
  const s = db.get('settings') || {};
  return { ...DEFAULT_SETTINGS, ...s, notify: { ...DEFAULT_SETTINGS.notify, ...(s.notify || {}) } };
}
export const saveSettings = partial => db.has('settings') ? db.patch('settings', partial) : db.put('settings', { ...DEFAULT_SETTINGS, ...partial }, 'settings');

// ---------- Предметы ----------

export const subjects = () => db.all('subject').slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const subject = id => (id ? db.get(id) : null);
export const subjColor = id => subject(id)?.color || 'var(--accent)';
export const subjShort = id => { const s = subject(id); return s ? (s.short || s.name) : ''; };

// ---------- Недели и пары ----------

export function weekNo(date) {
  const st = settings();
  return Math.floor(diffDays(mondayOf(st.semesterStart), mondayOf(date)) / 7) + 1;
}
// 1 — I неделя (нечётная), 2 — II неделя (чётная)
export const weekParity = date => (((weekNo(date) % 2) + 2) % 2 === 1 ? 1 : 2);
export const inSemester = date => { const st = settings(); return date >= st.semesterStart && date <= st.semesterEnd; };
export const pairTime = n => settings().pairs[n - 1] || ['00:00', '00:00'];

const occId = (lessonId, date) => `occ-${lessonId}-${date}`;

// Все пары на дату с учётом переносов, отмен, заметок и подгруппы
export function lessonsForDate(date, { includeCancelled = true } = {}) {
  const st = settings();
  const out = [];
  const overrides = db.all('override').filter(o => o.date === date);
  if (inSemester(date)) {
    const wd = weekday(date), par = weekParity(date);
    for (const l of db.all('lesson')) {
      if (l.day !== wd) continue;
      if (l.week && l.week !== par) continue;
      if (st.subgroup && l.subgroup && l.subgroup !== st.subgroup) continue;
      const ov = overrides.find(o => o.lessonId === l.id && o.action !== 'extra');
      out.push(makeOcc(l, date, ov));
    }
  }
  for (const o of overrides) if (o.action === 'extra') out.push(makeOcc({ ...o, id: o.id }, date, null, true));
  out.sort((a, b) => toMin(a.start) - toMin(b.start));
  return includeCancelled ? out : out.filter(x => !x.cancelled);
}

function makeOcc(l, date, ov, extra = false) {
  const base = { ...l, ...(ov && ov.action === 'change' ? stripEmpty(ov.fields) : {}) };
  const [ps, pe] = pairTime(base.pair);
  const occ = db.get(occId(l.id, date)) || {};
  return {
    key: `${l.id}@${date}`, lessonId: l.id, date, extra,
    pair: base.pair, start: base.start || ps, end: base.end || pe,
    subjectId: base.subjectId, title: base.title || subject(base.subjectId)?.name || base.title || 'Занятие',
    type: base.type, room: base.room, teachers: base.teachers || [], subgroup: base.subgroup,
    cancelled: ov?.action === 'cancel', changed: ov?.action === 'change', overrideId: ov?.id || (extra ? l.id : null),
    reason: ov?.reason || l.reason || '',
    note: occ.note || '', absent: !!occ.absent,
  };
}
const stripEmpty = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== '' && v != null));

export function setOccurrence(lessonId, date, partial) {
  const id = occId(lessonId, date);
  if (db.has(id)) { db.patch(id, partial); if (db.get(id) === null) db.restore(id); }
  else db.put('occ', { lessonId, date, note: '', absent: false, ...partial }, id);
}

export function cancelLesson(lessonId, date, reason = '') {
  const ex = db.all('override').find(o => o.date === date && o.lessonId === lessonId);
  if (ex) db.patch(ex.id, { action: 'cancel', reason });
  else db.put('override', { date, lessonId, action: 'cancel', reason });
}
export function changeLesson(lessonId, date, fields, reason = '') {
  const ex = db.all('override').find(o => o.date === date && o.lessonId === lessonId);
  if (ex) db.patch(ex.id, { action: 'change', fields, reason });
  else db.put('override', { date, lessonId, action: 'change', fields, reason });
}
export function resetLesson(lessonId, date) {
  for (const o of db.all('override')) if (o.date === date && o.lessonId === lessonId) db.remove(o.id);
}

const occStart = o => new Date(`${o.date}T${o.start}:00`).getTime();
const occEnd = o => new Date(`${o.date}T${o.end}:00`).getTime();

// Текущая и следующая пара (ищем до 14 дней вперёд)
export function nowAndNext() {
  const t = Date.now(); const d0 = today();
  let current = null, next = null;
  for (let i = 0; i < 14 && !next; i++) {
    const d = addDays(d0, i);
    for (const o of lessonsForDate(d, { includeCancelled: false })) {
      if (occStart(o) <= t && occEnd(o) > t) current = o;
      else if (occStart(o) > t && !next) next = o;
    }
  }
  return { current, next };
}

// Ближайшая пара по предмету после момента (для дедлайна «к следующей паре»)
export function nextLessonOf(subjectId, fromDate = today(), fromTime = nowTime()) {
  for (let i = 0; i < 120; i++) {
    const d = addDays(fromDate, i);
    for (const o of lessonsForDate(d, { includeCancelled: false })) {
      if (o.subjectId !== subjectId) continue;
      if (i === 0 && toMin(o.start) <= toMin(fromTime)) continue;
      return o;
    }
  }
  return null;
}

export function absences(subjectId) {
  return db.all('occ').filter(o => o.absent && lessonSubject(o.lessonId) === subjectId);
}
const lessonSubject = id => db.get(id)?.subjectId;

// ---------- Задачи ----------

export const PRIORITY = [
  { v: 0, name: 'Без приоритета' }, { v: 1, name: 'Низкий' }, { v: 2, name: 'Высокий' }, { v: 3, name: 'Срочно' },
];
export const STATUS = { todo: 'Не начато', doing: 'В процессе', done: 'Готово' };

export const tasks = () => db.all('task');
export const isDone = t => t.status === 'done';
export const taskDue = t => (t.due ? dueMs(t.due, t.dueTime) : Infinity);
export const isOverdue = t => !isDone(t) && t.due && taskDue(t) < Date.now();

export function categoryOf(t) {
  if (t.category === 'study' || (!t.category && t.subjectId)) {
    const s = subject(t.subjectId);
    return { id: 'study', name: s ? s.short || s.name : 'Учёба', color: s?.color || 'var(--accent)' };
  }
  const c = settings().taskCategories.find(c => c.id === t.category);
  return c || { id: t.category || 'personal', name: 'Личное', color: '#14a37f' };
}

export function sortTasks(list) {
  return list.slice().sort((a, b) =>
    (isDone(a) - isDone(b)) || (taskDue(a) - taskDue(b)) || ((b.priority || 0) - (a.priority || 0)) || ((a.createdAt || 0) - (b.createdAt || 0)));
}

export function newTask(partial = {}) {
  return {
    title: '', category: 'study', subjectId: '', type: '', due: '', dueTime: '', priority: 0, status: 'todo',
    subtasks: [], repeat: null, estimate: 0, notes: '', attachments: [], createdAt: Date.now(), ...partial,
  };
}

export function toggleTask(t) {
  if (isDone(t)) { db.patch(t.id, { status: 'todo', doneAt: null }); return null; }
  db.patch(t.id, { status: 'done', doneAt: Date.now() });
  // Повторяющаяся: создаём следующую
  if (t.repeat && t.due && !t.spawnedNext) {
    const n = Math.max(1, t.repeat.every || 1);
    const due = t.repeat.unit === 'day' ? addDays(t.due, n) : t.repeat.unit === 'month' ? addMonths(t.due, n) : addDays(t.due, 7 * n);
    const { id, ...rest } = t;
    db.patch(t.id, { spawnedNext: true });
    return db.put('task', { ...rest, due, status: 'todo', doneAt: null, spawnedNext: false, createdAt: Date.now(),
      subtasks: (t.subtasks || []).map(s => ({ ...s, done: false })) });
  }
  return null;
}

// ---------- Быстрый ввод ----------

const WD = [
  [1, /^(пн|понедельник[а]?)$/], [2, /^(вт|вторник[а]?)$/], [3, /^(ср|сред[уаы])$/], [4, /^(чт|четверг[а]?)$/],
  [5, /^(пт|пятниц[уаы])$/], [6, /^(сб|суббот[уаы])$/], [7, /^(вс|воскресенье|воскресенья)$/],
];
const TYPE_WORDS = [
  [/^лаб/, 'Лаба'], [/^(дз|домашк|домашн)/, 'ДЗ'], [/^курсов/, 'Курсовая'], [/^реферат/, 'Реферат'],
  [/^(тест|контрольн|кр$)/, 'Тест'], [/^конспект/, 'Конспект'],
];

// «сдать лабу по #вмо к паре !» → { title, subjectId, due, dueTime, priority, type, ... }
export function parseQuick(text) {
  const st = settings();
  const subs = subjects();
  const r = { category: '', subjectId: '', due: '', dueTime: '', priority: 0, type: '', repeat: null, untilLesson: false };
  let s = ' ' + text.trim() + ' ';
  const cut = re => { let m = null; s = s.replace(re, (...a) => { m = a; return ' '; }); return m; };

  let m;
  if ((m = cut(/\s(!{1,3})(?=\s)/))) r.priority = m[1].length === 1 ? 2 : 3;
  if (cut(/\sкажд(ый|ую|ое)\s+день(?=\s)/i)) r.repeat = { unit: 'day', every: 1 };
  else if (cut(/\sкажд(ый|ую|ое)\s+недел[юи](?=\s)/i)) r.repeat = { unit: 'week', every: 1 };
  else if (cut(/\sкажд(ый|ую|ое)\s+месяц(?=\s)/i)) r.repeat = { unit: 'month', every: 1 };

  // #тег: предмет или категория
  s = s.replace(/\s(?:по\s+)?#([\p{L}\p{N}_-]+)/giu, (all, tag) => {
    const t = tag.toLowerCase();
    const sub = subs.find(x => (x.tag || '').toLowerCase() === t || (x.short || '').toLowerCase() === t);
    if (sub) { r.subjectId = sub.id; r.category = 'study'; return ' '; }
    const cat = st.taskCategories.find(c => c.name.toLowerCase() === t || c.id === t);
    if (cat) { r.category = cat.id; return ' '; }
    if (t === 'учеба' || t === 'учёба') { r.category = 'study'; return ' '; }
    return all;
  });
  // Предмет по сокращению без решётки: «по ВМО»
  if (!r.subjectId) for (const sub of subs) {
    if (!sub.short) continue;
    const re = new RegExp(`(\\s)(по\\s+)?${sub.short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s,.!?])`, 'iu');
    if (re.test(s)) { r.subjectId = sub.id; r.category = 'study'; s = s.replace(re, ' '); break; }
  }

  if ((m = cut(/\s(?:в|к|до)?\s*(\d{1,2}):(\d{2})(?=\s)/))) r.dueTime = `${m[1].padStart(2, '0')}:${m[2]}`;
  if ((m = cut(/\s(?:к|до)?\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=\s)/))) {
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear());
    let d = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!m[3] && d < today()) d = `${Number(y) + 1}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    r.due = d;
  }
  if (!r.due) {
    if (cut(/\s(?:к|до|на)?\s*послезавтра(?=\s)/i)) r.due = addDays(today(), 2);
    else if (cut(/\s(?:к|до|на)?\s*завтра(?=\s)/i)) r.due = addDays(today(), 1);
    else if (cut(/\s(?:к|до|на)?\s*сегодня(?=\s)/i)) r.due = today();
    else if ((m = cut(/\sчерез\s+(\d+)\s*(дн[ейя]*|день|нед[еляюи]*)(?=\s)/i))) r.due = addDays(today(), Number(m[1]) * (/^нед/i.test(m[2]) ? 7 : 1));
    else if ((m = cut(/\sчерез\s+неделю(?=\s)/i))) r.due = addDays(today(), 7);
  }
  if (!r.due) {
    s = s.replace(/\s(?:(?:в|во|к|до)\s+)?([\p{L}]+)(?=\s)/gu, (all, w) => {
      if (r.due) return all;
      const hit = WD.find(([, re]) => re.test(w.toLowerCase()));
      if (!hit) return all;
      let d = today(); const cur = weekday(d);
      let add = (hit[0] - cur + 7) % 7; if (add === 0) add = 7;
      r.due = addDays(d, add); return ' ';
    });
  }
  // «к паре» / «к следующей паре»
  if (cut(/\s(?:к|до)\s+(?:след(?:ующей|\.)?\s+)?пар[еы](?=\s)/i)) r.untilLesson = true;
  if (r.untilLesson && r.subjectId) {
    const o = nextLessonOf(r.subjectId);
    if (o) { r.due = o.date; r.dueTime = o.start; }
  }
  for (const w of s.trim().split(/\s+/)) {
    const hit = TYPE_WORDS.find(([re]) => re.test(w.toLowerCase()));
    if (hit) { r.type = hit[1]; break; }
  }
  if (!r.category) r.category = r.subjectId ? 'study' : 'personal';
  r.title = s.replace(/\s+/g, ' ').trim().replace(/(\s(по|к|до|в|на))+$/i, '').trim();
  r.title = r.title.charAt(0).toUpperCase() + r.title.slice(1);
  return r;
}

// ---------- Вложения ----------

export const deviceRoots = () => { try { return JSON.parse(localStorage.getItem('dev.roots') || '{}'); } catch { return {}; } };
export const setDeviceRoots = r => localStorage.setItem('dev.roots', JSON.stringify(r));
export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function resolvePath(a) {
  let p = (a.path || '').trim();
  if (a.root) {
    const base = deviceRoots()[a.root];
    if (!base) return null;
    p = base.replace(/[\\/]+$/, '') + (p ? '\\' + p.replace(/^[\\/]+/, '') : '');
  }
  return p.replace(/\//g, '\\');
}

export function attachmentHref(a) {
  if (a.type === 'url') return a.url;
  const p = resolvePath(a);
  if (!p) return null;
  if (a.type === 'code') return 'vscode://file/' + p.replace(/\\/g, '/');
  if (a.type === 'path') return 'openpath:' + encodeURIComponent(p);
  return null;
}

// ---------- Поиск по всему ----------

export function searchAll(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const hit = (...xs) => xs.some(x => typeof x === 'string' && x.toLowerCase().includes(q));
  const out = [];
  for (const t of tasks()) if (hit(t.title, t.notes, ...(t.subtasks || []).map(s => s.text))) out.push({ type: 'task', item: t });
  for (const s of subjects()) if (hit(s.name, s.short, s.notes, s.requirements, ...(s.teachers || []).map(t => t.name))) out.push({ type: 'subject', item: s });
  for (const n of db.all('note')) if (hit(n.title, n.body)) out.push({ type: 'note', item: n });
  for (const e of db.all('event')) if (hit(e.title, e.notes)) out.push({ type: 'event', item: e });
  for (const e of db.all('exam')) if (hit(e.notes, e.type, subject(e.subjectId)?.name, ...(e.questions || []).map(x => x.text))) out.push({ type: 'exam', item: e });
  for (const o of db.all('occ')) if (hit(o.note)) out.push({ type: 'occ', item: o });
  return out.slice(0, 80);
}

export const dayKey = d => iso(d);
export { parseISO };

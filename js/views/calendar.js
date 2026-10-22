import { html, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Field, LessonItem, TaskItem, confirmDelete, lessonState, openModal, toast } from '../ui.js';
import { DOW, MONTHS, addDays, fmtDate, iso, mondayOf, parseISO, today, weekday } from '../date.js';
import { openTask } from './tasks.js';
import { openLesson, openExtraLesson } from './schedule.js';
import { openExam } from './session.js';

const COLORS = ['#4f6bed', '#14a37f', '#e8900c', '#e5484d', '#8e6cef', '#0ea5e9', '#d946ef', '#64748b'];

export function openEvent(ev, date) { openModal(close => html`<${EventEditor} ev=${ev} date=${date} close=${close} />`); }

function EventEditor({ ev, date, close }) {
  const [e, setE] = useState(() => ev ? { ...ev } : { title: '', date: date || today(), time: '', endTime: '', notes: '', color: COLORS[0], repeat: '' });
  const set = (k, v) => setE(x => ({ ...x, [k]: v }));
  const save = x => { x.preventDefault(); if (!e.title.trim()) return; if (ev) db.put('event', e, ev.id); else db.put('event', e); close(); };
  return html`<form onSubmit=${save}>
    <h2>${ev ? 'Событие' : 'Новое событие'}</h2>
    <div class="stack" style="gap:12px">
      <input class="input" autoFocus=${!ev} placeholder="Название (встреча, ДР, врач…)" value=${e.title} onInput=${x => set('title', x.target.value)} />
      <div class="fields">
        <${Field} label="Дата"><input class="input" type="date" value=${e.date} onInput=${x => set('date', x.target.value)} /><//>
        <${Field} label="Начало"><input class="input" type="time" value=${e.time} onInput=${x => set('time', x.target.value)} /><//>
        <${Field} label="Конец"><input class="input" type="time" value=${e.endTime} onInput=${x => set('endTime', x.target.value)} /><//>
        <${Field} label="Повтор"><select class="input" value=${e.repeat || ''} onChange=${x => set('repeat', x.target.value)}>
          <option value="">Нет</option><option value="week">Каждую неделю</option><option value="month">Каждый месяц</option><option value="year">Каждый год</option></select><//>
      </div>
      <div class="row">${COLORS.map(c => html`<button type="button" style=${{ width: 26, height: 26, borderRadius: 13, border: e.color === c ? '3px solid var(--text)' : '0', background: c, cursor: 'pointer' }} onClick=${() => set('color', c)}></button>`)}</div>
      <${Field} label="Заметки"><textarea class="input" value=${e.notes} onInput=${x => set('notes', x.target.value)}></textarea><//>
    </div>
    <div class="modal-foot">
      ${ev && html`<button type="button" class="btn danger" style="margin-right:auto" onClick=${() => confirmDelete('событие', () => { db.remove(ev.id); close(); toast('Удалено', { label: 'Вернуть', fn: () => db.restore(ev.id) }); })}>Удалить</button>`}
      <button type="button" class="btn" onClick=${close}>Отмена</button><button class="btn primary">Сохранить</button>
    </div>
  </form>`;
}

// События на дату с учётом повторов
export function eventsOn(date) {
  return db.all('event').filter(e => {
    if (e.date === date) return true;
    if (!e.repeat || e.date > date) return false;
    const a = parseISO(e.date), b = parseISO(date);
    if (e.repeat === 'week') return weekday(e.date) === weekday(date);
    if (e.repeat === 'month') return a.getDate() === b.getDate();
    if (e.repeat === 'year') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    return false;
  }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

export function CalendarView({ query }) {
  db.useStore();
  const [sel, setSel] = useState(query.d || today());
  const [month, setMonth] = useState(() => (query.d || today()).slice(0, 7));
  const [showLessons, setShowLessons] = useState(false);
  const first = month + '-01';
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const lastRowNeeded = cells.slice(35).some(d => d.startsWith(month));
  const grid = lastRowNeeded ? cells : cells.slice(0, 35);
  const shift = n => { const d = parseISO(first); d.setMonth(d.getMonth() + n); setMonth(iso(d).slice(0, 7)); };

  const tasks = M.tasks().filter(t => t.due);
  const exams = db.all('exam').filter(e => e.date);
  const dayItems = d => {
    const out = [];
    for (const e of exams) if (e.date === d) out.push({ k: e.id, cls: 'exam', c: M.subjColor(e.subjectId), text: `${e.type}: ${M.subjShort(e.subjectId)}` });
    for (const e of eventsOn(d)) out.push({ k: e.id, cls: '', c: e.color, text: `${e.time ? e.time + ' ' : ''}${e.title}` });
    for (const t of tasks) if (t.due === d && !M.isDone(t)) out.push({ k: t.id, cls: 'task' + (M.isOverdue(t) ? ' overdue' : ''), c: M.categoryOf(t).color, text: t.title });
    if (showLessons) for (const o of M.lessonsForDate(d, { includeCancelled: false })) out.push({ k: o.key, cls: '', c: M.subjColor(o.subjectId), text: `${o.start} ${M.subjShort(o.subjectId)}` });
    return out;
  };
  const [y, m] = month.split('-').map(Number);

  return html`<div>
    <div class="page-head">
      <h1>Календарь</h1>
      <button class="btn" onClick=${() => openExtraLesson(sel)}>+ Пара</button>
      <button class="btn primary" onClick=${() => openEvent(null, sel)}>+ Событие</button>
    </div>
    <div class="row between" style="margin-bottom:12px">
      <div class="row">
        <button class="btn icon" onClick=${() => shift(-1)}>←</button>
        <button class="btn" onClick=${() => { setMonth(today().slice(0, 7)); setSel(today()); }}>Сегодня</button>
        <button class="btn icon" onClick=${() => shift(1)}>→</button>
        <span class="bold" style="font-size:17px;text-transform:capitalize">${MONTHS[m - 1]} ${y}</span>
      </div>
      <label class="check small"><input type="checkbox" checked=${showLessons} onChange=${() => setShowLessons(!showLessons)} /> показывать пары</label>
    </div>
    <div class="cal">
      ${DOW.map(d => html`<div class="dow">${d}</div>`)}
      ${grid.map(d => {
        const its = dayItems(d);
        return html`<div key=${d} class=${'cell' + (d.startsWith(month) ? '' : ' other') + (d === today() ? ' today' : '') + (d === sel ? ' sel' : '')} onClick=${() => setSel(d)}>
          <span class="num">${Number(d.slice(8))}</span>
          ${its.slice(0, 4).map(x => html`<div key=${x.k} class=${'ev ' + x.cls} style=${{ '--c': x.c }}>${x.text}</div>`)}
          ${its.length > 4 && html`<div class="tiny muted">+${its.length - 4}</div>`}
          <div class="dots">${its.slice(0, 6).map(x => html`<i key=${x.k} style=${{ '--c': x.c }}></i>`)}</div>
        </div>`;
      })}
    </div>
    <${DayPanel} d=${sel} />
  </div>`;
}

function DayPanel({ d }) {
  const lessons = M.lessonsForDate(d);
  const evs = eventsOn(d);
  const ts = M.sortTasks(M.tasks().filter(t => t.due === d));
  const exams = db.all('exam').filter(e => e.date === d);
  return html`<div class="card" style="margin-top:14px">
    <div class="row between"><h2>${fmtDate(d, { weekday: true, year: true })}</h2>
      <div class="row"><button class="btn sm" onClick=${() => openTask(null, { due: d })}>+ Задача</button><button class="btn sm" onClick=${() => openEvent(null, d)}>+ Событие</button></div></div>
    ${exams.map(e => html`<div class="list-row" key=${e.id} style="cursor:pointer" onClick=${() => openExam(e)}><span class="chip danger">${e.type}</span><b>${M.subject(e.subjectId)?.name}</b><span class="muted small">${e.time || ''} ${e.room ? '· ' + e.room : ''}</span></div>`)}
    ${evs.map(e => html`<div class="list-row" key=${e.id} style="cursor:pointer" onClick=${() => openEvent(e)}>
      <span class="chip"><span class="sw" style=${{ background: e.color }}></span>${e.time ? e.time + (e.endTime ? '–' + e.endTime : '') : 'весь день'}</span><span>${e.title}</span>${e.repeat && html`<span class="muted">🔁</span>`}</div>`)}
    ${lessons.length > 0 && html`<div class="section-title">Пары</div>${lessons.map(o => html`<${LessonItem} key=${o.key} o=${o} onOpen=${openLesson} state=${lessonState(o)} />`)}`}
    <div class="section-title">Дедлайны</div>
    ${ts.length ? ts.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} />`) : html`<div class="muted small">Нет</div>`}
  </div>`;
}

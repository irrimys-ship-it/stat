import { html, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Empty, Field, LessonItem, Seg, SubjectSelect, TaskItem, confirmDelete, go, lessonState, openModal, toast } from '../ui.js';
import { DOW, DOW_FULL, addDays, fmtDate, mondayOf, today, weekday } from '../date.js';
import { openTask } from './tasks.js';

const LESSON_TYPES = ['Лекция', 'Практика', 'Лабораторная', 'Семинар', 'Консультация', 'Другое'];

// ---------- Карточка конкретной пары ----------

export function openLesson(o) { openModal(close => html`<${LessonModal} o=${o} close=${close} />`); }

function LessonModal({ o, close }) {
  db.useStore();
  const occ = M.lessonsForDate(o.date).find(x => x.key === o.key) || o;
  const [note, setNote] = useState(occ.note);
  const [editing, setEditing] = useState(false);
  const s = M.subject(occ.subjectId);
  const related = M.tasks().filter(t => t.subjectId === occ.subjectId && !M.isDone(t));
  const dueHere = related.filter(t => t.due === occ.date);

  const saveNote = () => { if (note !== occ.note) { M.setOccurrence(occ.lessonId, occ.date, { note }); toast('Заметка сохранена'); } };
  const toggleAbsent = () => M.setOccurrence(occ.lessonId, occ.date, { absent: !occ.absent });

  if (editing) return html`<${LessonForm} title="Изменить пару только на эту дату" initial=${occ} close=${() => setEditing(false)}
    onSave=${f => { if (occ.extra) db.patch(occ.overrideId, f); else M.changeLesson(occ.lessonId, occ.date, f); setEditing(false); }} />`;

  return html`<div>
    <h2 style="margin-bottom:4px">${occ.title}</h2>
    <div class="muted small" style="margin-bottom:14px">${fmtDate(occ.date, { weekday: true })} · ${occ.start}–${occ.end} · ${occ.pair ? occ.pair + ' пара' : ''}</div>
    <div class="kv" style="margin-bottom:14px">
      <span>Тип</span><span>${occ.type || '—'}</span>
      <span>Аудитория</span><span>${occ.room || '—'}</span>
      <span>Преподаватель</span><span>${occ.teachers.join(', ') || '—'}</span>
      ${occ.subgroup ? html`<span>Подгруппа</span><span>${occ.subgroup}</span>` : null}
      ${occ.reason && html`<span>Причина</span><span>${occ.reason}</span>`}
    </div>
    ${occ.cancelled && html`<div class="chip danger" style="margin-bottom:12px">Пара отменена на эту дату</div>`}

    <${Field} label="Заметка к этой паре (принести ноут, будет самостоятельная…)">
      <textarea class="input" value=${note} onInput=${e => setNote(e.target.value)} onBlur=${saveNote}></textarea><//>

    <div class="row" style="margin-top:12px">
      <label class="check"><input type="checkbox" checked=${occ.absent} onChange=${toggleAbsent} /> Пропустил эту пару</label>
    </div>

    <div class="section-title">Задачи по предмету${dueHere.length ? ` · к этой паре: ${dueHere.length}` : ''}</div>
    ${related.length ? related.slice(0, 6).map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} showSubject=${false} />`) : html`<div class="muted small">Нет открытых задач</div>`}
    <div class="row" style="margin-top:8px">
      <button class="btn sm" onClick=${() => openTask(null, { category: 'study', subjectId: occ.subjectId, due: occ.date, dueTime: occ.start })}>+ Задача к этой паре</button>
      ${s && html`<button class="btn sm" onClick=${() => { close(); go('subjects/' + s.id); }}>Открыть предмет</button>`}
    </div>

    <div class="modal-foot">
      ${occ.extra
        ? html`<button class="btn danger" style="margin-right:auto" onClick=${() => confirmDelete('доп. пару', () => { db.remove(occ.overrideId); close(); })}>Удалить</button>`
        : occ.cancelled || occ.changed
          ? html`<button class="btn" style="margin-right:auto" onClick=${() => M.resetLesson(occ.lessonId, occ.date)}>Вернуть как было</button>`
          : html`<button class="btn danger" style="margin-right:auto" onClick=${() => { const r = prompt('Причина отмены (необязательно):', ''); if (r !== null) M.cancelLesson(occ.lessonId, occ.date, r); }}>Отменить на эту дату</button>`}
      <button class="btn" onClick=${() => setEditing(true)}>Перенос / замена</button>
      <button class="btn primary" onClick=${() => { saveNote(); close(); }}>Готово</button>
    </div>
  </div>`;
}

// Форма пары: используется для шаблона, разовых изменений и доп. пар
function LessonForm({ title, initial = {}, withWeek = false, withDate = false, close, onSave, onDelete }) {
  const st = M.settings();
  const [f, setF] = useState(() => ({
    subjectId: '', type: 'Лекция', pair: 1, start: '', end: '', room: '', teachers: [], subgroup: 0, week: 0, day: 1, date: today(), reason: '',
    ...initial, teachersText: (initial.teachers || []).join(', '),
  }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const [ps, pe] = st.pairs[f.pair - 1] || ['', ''];
  const submit = e => {
    e.preventDefault();
    if (!f.subjectId && !f.title) { toast('Выбери предмет'); return; }
    const out = { subjectId: f.subjectId, type: f.type, pair: Number(f.pair), room: f.room.trim(), subgroup: Number(f.subgroup) || 0,
      teachers: f.teachersText.split(',').map(x => x.trim()).filter(Boolean) };
    if (f.start && f.start !== ps) out.start = f.start;
    if (f.end && f.end !== pe) out.end = f.end;
    if (withWeek) { out.week = Number(f.week); out.day = Number(f.day); }
    if (withDate) { out.date = f.date; out.reason = f.reason; }
    onSave(out);
  };
  return html`<form onSubmit=${submit}>
    <h2>${title}</h2>
    <div class="stack" style="gap:12px">
      <${Field} label="Предмет"><${SubjectSelect} value=${f.subjectId} onChange=${v => set('subjectId', v)} emptyLabel="— выбери —" /><//>
      <div class="fields">
        <${Field} label="Тип"><select class="input" value=${f.type} onChange=${e => set('type', e.target.value)}>${LESSON_TYPES.map(x => html`<option>${x}</option>`)}</select><//>
        <${Field} label="Пара"><select class="input" value=${f.pair} onChange=${e => setF(x => ({ ...x, pair: Number(e.target.value), start: '', end: '' }))}>
          ${st.pairs.map((p, i) => html`<option value=${i + 1}>${i + 1} пара (${p[0]}–${p[1]})</option>`)}</select><//>
        <${Field} label="Начало"><input class="input" type="time" value=${f.start || ps} onInput=${e => set('start', e.target.value)} /><//>
        <${Field} label="Конец"><input class="input" type="time" value=${f.end || pe} onInput=${e => set('end', e.target.value)} /><//>
      </div>
      <div class="fields">
        <${Field} label="Аудитория"><input class="input" value=${f.room} onInput=${e => set('room', e.target.value)} /><//>
        <${Field} label="Преподаватели (через запятую)"><input class="input" value=${f.teachersText} onInput=${e => set('teachersText', e.target.value)} /><//>
        <${Field} label="Подгруппа"><select class="input" value=${f.subgroup} onChange=${e => set('subgroup', e.target.value)}>
          <option value="0">Вся группа</option><option value="1">1</option><option value="2">2</option></select><//>
      </div>
      ${withWeek && html`<div class="fields">
        <${Field} label="День"><select class="input" value=${f.day} onChange=${e => set('day', e.target.value)}>${DOW_FULL.map((d, i) => html`<option value=${i + 1}>${d}</option>`)}</select><//>
        <${Field} label="Неделя"><select class="input" value=${f.week} onChange=${e => set('week', e.target.value)}>
          <option value="0">Каждую</option><option value="1">I (нечётная)</option><option value="2">II (чётная)</option></select><//>
      </div>`}
      ${withDate && html`<div class="fields">
        <${Field} label="Дата"><input class="input" type="date" value=${f.date} onInput=${e => set('date', e.target.value)} /><//>
        <${Field} label="Комментарий"><input class="input" value=${f.reason} onInput=${e => set('reason', e.target.value)} placeholder="перенос с пятницы" /><//>
      </div>`}
    </div>
    <div class="modal-foot">
      ${onDelete && html`<button type="button" class="btn danger" style="margin-right:auto" onClick=${onDelete}>Удалить</button>`}
      <button type="button" class="btn" onClick=${close}>Отмена</button>
      <button type="submit" class="btn primary">Сохранить</button>
    </div>
  </form>`;
}

export function openExtraLesson(date = today()) {
  openModal(close => html`<${LessonForm} title="Дополнительная пара / перенос" withDate initial=${{ date }} close=${close}
    onSave=${f => { db.put('override', { ...f, action: 'extra' }); close(); toast('Пара добавлена'); }} />`);
}

// ---------- Экран расписания ----------

export function ScheduleView({ query }) {
  db.useStore();
  const st = M.settings();
  const [mode, setMode] = useState(query.mode || 'week');
  const [anchor, setAnchor] = useState(today());
  const mon = mondayOf(anchor);
  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(mon, i));
  const hasSat = M.lessonsForDate(days[5]).length > 0;
  const shown = hasSat ? days : days.slice(0, 5);
  const par = M.weekParity(mon);

  return html`<div>
    <div class="page-head">
      <h1>Расписание</h1>
      <${Seg} value=${mode} onChange=${setMode} options=${[['week', 'Неделя'], ['template', 'Шаблон']]} />
    </div>
    ${mode === 'week' ? html`
      <div class="row between" style="margin-bottom:14px">
        <div class="row">
          <button class="btn icon" onClick=${() => setAnchor(addDays(anchor, -7))}>←</button>
          <button class="btn" onClick=${() => setAnchor(today())}>Сегодня</button>
          <button class="btn icon" onClick=${() => setAnchor(addDays(anchor, 7))}>→</button>
          <span class="bold">${fmtDate(mon)} — ${fmtDate(addDays(mon, 6))}</span>
          ${M.inSemester(mon) || M.inSemester(addDays(mon, 6))
            ? html`<span class="chip accent">${par === 1 ? 'I' : 'II'} неделя · ${M.weekNo(mon)}-я учебная</span>`
            : html`<span class="chip">вне семестра</span>`}
        </div>
        <button class="btn sm" onClick=${() => openExtraLesson(anchor)}>+ Доп. пара</button>
      </div>
      <div class="week-grid" style=${{ '--days': shown.length }}>
        ${shown.map(d => {
          const ls = M.lessonsForDate(d);
          const dl = M.tasks().filter(t => t.due === d && !M.isDone(t));
          return html`<div class="day-col" key=${d}>
            <div class=${'day-head' + (d === today() ? ' today' : '')}>${DOW_FULL[weekday(d) - 1]} <span class="muted small">${fmtDate(d)}</span></div>
            ${ls.length ? ls.map(o => html`<${LessonItem} key=${o.key} o=${o} onOpen=${openLesson} state=${lessonState(o)} />`) : html`<div class="muted small" style="padding:10px 0">Пар нет</div>`}
            ${dl.length > 0 && html`<div class="tiny warn-text" style="margin-top:6px;cursor:pointer" onClick=${() => go('calendar?d=' + d)}>⏰ дедлайнов: ${dl.length}</div>`}
          </div>`;
        })}
      </div>` : html`<${TemplateEditor} />`}
  </div>`;
}

function TemplateEditor() {
  const lessons = db.all('lesson').slice().sort((a, b) => a.day - b.day || a.pair - b.pair || (a.week || 0) - (b.week || 0));
  const edit = l => openModal(close => html`<${LessonForm} title=${l ? 'Пара в шаблоне' : 'Новая пара в шаблоне'} withWeek initial=${l || {}} close=${close}
    onSave=${f => { if (l) db.patch(l.id, f); else db.put('lesson', f); close(); }}
    onDelete=${l && (() => confirmDelete('пару из шаблона', () => { db.remove(l.id); close(); }))} />`);
  const byDay = [1, 2, 3, 4, 5, 6].map(d => [d, lessons.filter(l => l.day === d)]).filter(([, ls]) => ls.length);
  return html`<div>
    <div class="row between" style="margin-bottom:12px">
      <span class="muted small">Повторяющееся расписание на семестр. Разовые изменения делаются кликом по паре в режиме «Неделя».</span>
      <button class="btn primary" onClick=${() => edit(null)}>+ Пара</button>
    </div>
    ${byDay.length === 0 && html`<${Empty}>Шаблон пуст<//>`}
    <div class="grid two">
      ${byDay.map(([d, ls]) => html`<div class="card" key=${d}>
        <h3>${DOW_FULL[d - 1]}</h3>
        ${ls.map(l => { const [s, e] = M.pairTime(l.pair); return html`<div class="list-row" key=${l.id} style="cursor:pointer" onClick=${() => edit(l)}>
          <span class="chip" style="min-width:44px">${l.week ? (l.week === 1 ? 'I' : 'II') : 'I+II'}</span>
          <span class="tiny muted" style="width:76px">${l.pair} п. ${l.start || s}</span>
          <span class="grow"><span style=${{ color: M.subjColor(l.subjectId), fontWeight: 600 }}>${M.subjShort(l.subjectId)}</span> <span class="small muted">${l.type} · ${l.room}${l.subgroup ? ' · п/гр.' + l.subgroup : ''}</span></span>
        </div>`; })}
      </div>`)}
    </div>
  </div>`;
}

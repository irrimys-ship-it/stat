import { html, useState, useMemo } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Attachments, Chip, Empty, Field, Seg, SubjectSelect, TaskItem, confirmDelete, openModal, toast } from '../ui.js';
import { addDays, fmtDate, mondayOf, today } from '../date.js';

// ---------- Редактор задачи ----------

export function openTask(t, preset = {}) {
  openModal(close => html`<${TaskEditor} task=${t} preset=${preset} close=${close} />`);
}

function TaskEditor({ task, preset, close }) {
  const st = M.settings();
  const [t, setT] = useState(() => task ? { ...task } : M.newTask(preset));
  const [newSub, setNewSub] = useState('');
  const set = (k, v) => setT(x => ({ ...x, [k]: v }));
  const isStudy = t.category === 'study';

  const setUntilLesson = () => {
    if (!t.subjectId) { toast('Сначала выбери предмет'); return; }
    const o = M.nextLessonOf(t.subjectId);
    if (!o) { toast('Ближайшая пара не найдена'); return; }
    setT(x => ({ ...x, due: o.date, dueTime: o.start }));
    toast(`К паре: ${fmtDate(o.date, { weekday: true })}, ${o.start}`);
  };
  const save = e => {
    e?.preventDefault();
    if (!t.title.trim()) { toast('Напиши, что нужно сделать'); return; }
    const data = { ...t, title: t.title.trim(), subjectId: isStudy ? t.subjectId : '' };
    if (task) db.put('task', data, task.id); else db.put('task', data);
    close();
  };
  const addSub = () => {
    if (!newSub.trim()) return;
    set('subtasks', [...(t.subtasks || []), { id: db.uid(), text: newSub.trim(), done: false }]); setNewSub('');
  };

  return html`<form onSubmit=${save}>
    <h2>${task ? 'Задача' : 'Новая задача'}</h2>
    <div class="stack" style="gap:12px">
      <input class="input" style="font-size:17px;font-weight:500" autoFocus=${!task} placeholder="Что нужно сделать?"
        value=${t.title} onInput=${e => set('title', e.target.value)} />
      <div class="row">
        <button type="button" class=${'chip' + (isStudy ? ' on' : '')} onClick=${() => set('category', 'study')}>🎓 Учёба</button>
        ${st.taskCategories.map(c => html`<button type="button" class=${'chip' + (t.category === c.id ? ' on' : '')} onClick=${() => set('category', c.id)}>${c.name}</button>`)}
      </div>
      ${isStudy && html`<div class="fields">
        <${Field} label="Предмет"><${SubjectSelect} value=${t.subjectId} onChange=${v => set('subjectId', v)} /><//>
        <${Field} label="Тип работы">
          <select class="input" value=${t.type} onChange=${e => set('type', e.target.value)}>
            <option value="">—</option>${st.taskTypes.map(x => html`<option>${x}</option>`)}
          </select><//>
      </div>`}
      <div class="fields">
        <${Field} label="Срок (дата)"><input class="input" type="date" value=${t.due} onInput=${e => set('due', e.target.value)} /><//>
        <${Field} label="Время"><input class="input" type="time" value=${t.dueTime} onInput=${e => set('dueTime', e.target.value)} /><//>
      </div>
      <div class="row">
        <button type="button" class="btn sm" onClick=${() => set('due', today())}>Сегодня</button>
        <button type="button" class="btn sm" onClick=${() => set('due', addDays(today(), 1))}>Завтра</button>
        <button type="button" class="btn sm" onClick=${() => set('due', addDays(mondayOf(today()), 6))}>К концу недели</button>
        ${isStudy && html`<button type="button" class="btn sm" onClick=${setUntilLesson}>К следующей паре</button>`}
        ${t.due && html`<button type="button" class="btn sm ghost" onClick=${() => setT(x => ({ ...x, due: '', dueTime: '' }))}>Без срока</button>`}
      </div>
      <div class="fields">
        <${Field} label="Приоритет">
          <select class="input" value=${t.priority} onChange=${e => set('priority', Number(e.target.value))}>
            ${M.PRIORITY.map(p => html`<option value=${p.v}>${p.name}</option>`)}
          </select><//>
        <${Field} label="Статус">
          <select class="input" value=${t.status} onChange=${e => set('status', e.target.value)}>
            ${Object.entries(M.STATUS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
          </select><//>
        <${Field} label="Займёт (мин)"><input class="input" type="number" min="0" step="15" value=${t.estimate || ''} onInput=${e => set('estimate', Number(e.target.value) || 0)} /><//>
        <${Field} label="Повтор">
          <select class="input" value=${t.repeat ? t.repeat.unit : ''} onChange=${e => set('repeat', e.target.value ? { unit: e.target.value, every: 1 } : null)}>
            <option value="">Не повторять</option><option value="day">Каждый день</option><option value="week">Каждую неделю</option><option value="month">Каждый месяц</option>
          </select><//>
      </div>

      <div>
        <div class="section-title" style="margin-top:4px">Подзадачи</div>
        ${(t.subtasks || []).map(s => html`<div class="row" key=${s.id} style="margin-bottom:4px">
          <label class="check grow"><input type="checkbox" checked=${s.done} onChange=${() => set('subtasks', t.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x))} />
            <span style=${s.done ? 'text-decoration:line-through;color:var(--muted)' : ''}>${s.text}</span></label>
          <button type="button" class="btn sm ghost" onClick=${() => set('subtasks', t.subtasks.filter(x => x.id !== s.id))}>✕</button>
        </div>`)}
        <div class="quick-add"><input class="input" placeholder="Добавить пункт…" value=${newSub} onInput=${e => setNewSub(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} />
          <button type="button" class="btn" onClick=${addSub}>+</button></div>
      </div>

      <${Field} label="Заметки"><textarea class="input" value=${t.notes} onInput=${e => set('notes', e.target.value)} placeholder="Условие, ссылки, мысли…"></textarea><//>
      <div>
        <div class="section-title" style="margin-top:4px">Вложения</div>
        <${Attachments} list=${t.attachments || []} onChange=${v => set('attachments', v)} />
      </div>
    </div>
    <div class="modal-foot">
      ${task && html`<button type="button" class="btn danger" style="margin-right:auto" onClick=${() => confirmDelete('задачу', () => {
        db.remove(task.id); close(); toast('Задача удалена', { label: 'Вернуть', fn: () => db.restore(task.id) });
      })}>Удалить</button>`}
      <button type="button" class="btn" onClick=${close}>Отмена</button>
      <button type="submit" class="btn primary">Сохранить</button>
    </div>
  </form>`;
}

// ---------- Быстрое добавление ----------

export function QuickAdd({ preset = {} }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? M.parseQuick(text) : null), [text]);
  const submit = e => {
    e.preventDefault();
    if (!parsed || !parsed.title) return;
    const { untilLesson, ...p } = parsed;
    const data = M.newTask({ ...p, ...Object.fromEntries(Object.entries(preset).filter(([, v]) => v)) });
    if (preset.subjectId) data.category = 'study';
    db.put('task', data);
    setText('');
    toast(`Добавлено: ${data.title}${data.due ? ' · ' + fmtDate(data.due) : ''}`);
  };
  const cat = parsed ? M.categoryOf({ ...parsed, ...preset }) : null;
  return html`<form onSubmit=${submit}>
    <div class="quick-add">
      <input class="input" value=${text} onInput=${e => setText(e.target.value)}
        placeholder="Быстро: «лаба по #вмо к паре !» или «купить продукты завтра 18:00»" />
      <button class="btn primary" type="submit">Добавить</button>
    </div>
    ${parsed && parsed.title ? html`<div class="row" style="margin-top:6px">
      <span class="muted tiny">Будет:</span><b class="small">${parsed.title}</b>
      <${Chip} color=${cat.color}>${cat.name}<//>
      ${parsed.type && html`<span class="chip">${parsed.type}</span>`}
      ${parsed.due && html`<span class="chip">⏰ ${fmtDate(parsed.due, { weekday: true })}${parsed.dueTime ? ' ' + parsed.dueTime : ''}</span>`}
      ${parsed.priority >= 2 && html`<span class="chip warn">${parsed.priority === 3 ? 'срочно' : 'важно'}</span>`}
      ${parsed.repeat && html`<span class="chip">🔁</span>`}
    </div>` : html`<div class="hint-line">#вмо #спту #иняз — предмет, «завтра», «в пт», «25.10», «18:00», «к паре», «!» — важно, «каждую неделю»</div>`}
  </form>`;
}

// ---------- Экран задач ----------

export function TasksView({ query }) {
  db.useStore();
  const st = M.settings();
  const [filter, setFilter] = useState(query.f || 'active');
  const [cat, setCat] = useState(query.cat || 'all');
  const [subj, setSubj] = useState(query.subject || '');
  const [group, setGroup] = useState('due');
  const [q, setQ] = useState('');

  let list = M.tasks();
  if (filter === 'active') list = list.filter(t => !M.isDone(t));
  if (filter === 'done') list = list.filter(M.isDone);
  if (filter === 'overdue') list = list.filter(M.isOverdue);
  if (cat === 'study') list = list.filter(t => t.category === 'study');
  else if (cat !== 'all') list = list.filter(t => t.category === cat);
  if (subj) list = list.filter(t => t.subjectId === subj);
  if (q.trim()) { const s = q.toLowerCase(); list = list.filter(t => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(s)); }
  list = M.sortTasks(list);
  if (filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const groups = groupTasks(list, group, filter);
  const overdueN = M.tasks().filter(M.isOverdue).length;

  return html`<div>
    <div class="page-head"><h1>Задачи</h1><button class="btn primary" onClick=${() => openTask(null, subj ? { subjectId: subj, category: 'study' } : {})}>+ Задача</button></div>
    <div class="card"><${QuickAdd} preset=${subj ? { subjectId: subj } : {}} /></div>
    <div class="row" style="margin:14px 0 10px">
      <${Seg} value=${filter} onChange=${setFilter} options=${[['active', 'Активные'], ['overdue', `Просрочено${overdueN ? ' · ' + overdueN : ''}`], ['done', 'Готово'], ['all', 'Все']]} />
      <${Seg} value=${group} onChange=${setGroup} options=${[['due', 'По сроку'], ['subject', 'По предмету'], ['status', 'По статусу']]} />
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class=${'chip' + (cat === 'all' ? ' on' : '')} onClick=${() => { setCat('all'); setSubj(''); }}>Все</button>
      <button class=${'chip' + (cat === 'study' && !subj ? ' on' : '')} onClick=${() => { setCat('study'); setSubj(''); }}>🎓 Учёба</button>
      ${M.subjects().map(s => html`<button class=${'chip' + (subj === s.id ? ' on' : '')} onClick=${() => { setCat('study'); setSubj(s.id); }}>${s.short || s.name}</button>`)}
      ${st.taskCategories.map(c => html`<button class=${'chip' + (cat === c.id ? ' on' : '')} onClick=${() => { setCat(c.id); setSubj(''); }}>${c.name}</button>`)}
      <input class="input" style="max-width:200px;padding:5px 10px" placeholder="Поиск…" value=${q} onInput=${e => setQ(e.target.value)} />
    </div>
    ${list.length === 0 && html`<div class="card"><${Empty}>${filter === 'active' ? 'Нет активных задач 🎉' : 'Пусто'}<//></div>`}
    ${groups.map(([title, items]) => html`<div key=${title}>
      <div class="section-title">${title} · ${items.length}</div>
      ${items.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} />`)}
    </div>`)}
  </div>`;
}

function groupTasks(list, mode, filter) {
  if (filter === 'done') return list.length ? [['Выполнено', list]] : [];
  const map = new Map();
  const push = (k, t) => { if (!map.has(k)) map.set(k, []); map.get(k).push(t); };
  const td = today(), wkEnd = addDays(mondayOf(td), 6);
  for (const t of list) {
    if (mode === 'subject') push(t.category === 'study' ? (M.subject(t.subjectId)?.name || 'Учёба без предмета') : M.categoryOf(t).name, t);
    else if (mode === 'status') push(M.STATUS[t.status] || 'Не начато', t);
    else {
      if (M.isDone(t)) push('Выполнено', t);
      else if (!t.due) push('Без срока', t);
      else if (M.isOverdue(t)) push('Просрочено', t);
      else if (t.due === td) push('Сегодня', t);
      else if (t.due === addDays(td, 1)) push('Завтра', t);
      else if (t.due <= wkEnd) push('На этой неделе', t);
      else if (t.due <= addDays(wkEnd, 7)) push('На следующей неделе', t);
      else push('Позже', t);
    }
  }
  const order = ['Просрочено', 'Сегодня', 'Завтра', 'На этой неделе', 'На следующей неделе', 'Позже', 'Без срока', 'Выполнено', ...Object.values(M.STATUS)];
  return [...map.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
  });
}

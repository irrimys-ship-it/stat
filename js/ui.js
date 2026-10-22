// Общие компоненты интерфейса.

import { html, useState, useEffect, useRef } from './html.js';
import * as db from './store.js';
import * as M from './model.js';
import { fmtDate, relDay, today, untilText } from './date.js';

// ---------- Навигация ----------

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export const go = path => { location.hash = '#/' + path.replace(/^\//, ''); };

// ---------- Модальные окна и уведомления ----------

let modals = [];
const modalSubs = new Set();
const emitModals = () => modalSubs.forEach(f => f([...modals]));
export function openModal(render) { const id = Math.random(); modals.push({ id, render }); emitModals(); return () => closeModal(id); }
export function closeModal(id) { modals = id == null ? modals.slice(0, -1) : modals.filter(m => m.id !== id); emitModals(); }

let toastState = null; const toastSubs = new Set(); let toastTimer;
export function toast(text, action) {
  toastState = { text, action, k: Math.random() }; toastSubs.forEach(f => f(toastState));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastState = null; toastSubs.forEach(f => f(null)); }, action ? 6000 : 3000);
}

export function Overlays() {
  const [list, setList] = useState(modals);
  const [t, setT] = useState(toastState);
  useEffect(() => { modalSubs.add(setList); toastSubs.add(setT); return () => { modalSubs.delete(setList); toastSubs.delete(setT); }; }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && modals.length) closeModal(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);
  return html`
    ${list.map(m => html`<div class="overlay" key=${m.id} onMouseDown=${e => e.target === e.currentTarget && closeModal(m.id)}>
      <div class="modal">${m.render(() => closeModal(m.id))}</div></div>`)}
    ${t && html`<div class="toast" key=${t.k}><span>${t.text}</span>
      ${t.action && html`<button onClick=${() => { t.action.fn(); toastState = null; setT(null); }}>${t.action.label}</button>`}</div>`}`;
}

export function confirmDelete(what, fn) {
  if (confirm(`Удалить ${what}?`)) fn();
}

// ---------- Мелкие элементы ----------

export const Field = ({ label, children, style }) => html`<label class="field" style=${style}>${label}${children}</label>`;

export function Seg({ value, options, onChange }) {
  return html`<div class="seg">${options.map(([v, label]) =>
    html`<button type="button" class=${v === value ? 'on' : ''} onClick=${() => onChange(v)}>${label}</button>`)}</div>`;
}

export const Chip = ({ color, children, cls = '' }) =>
  html`<span class=${'chip ' + cls}>${color && html`<span class="sw" style=${{ background: color }}></span>`}${children}</span>`;

export const Empty = ({ children }) => html`<div class="empty">${children}</div>`;

export function Progress({ value, max }) {
  const p = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return html`<div class="progress"><div style=${{ width: p + '%' }}></div></div>`;
}

export function SubjectSelect({ value, onChange, allowEmpty = true, emptyLabel = '— без предмета —' }) {
  return html`<select class="input" value=${value || ''} onChange=${e => onChange(e.target.value)}>
    ${allowEmpty && html`<option value="">${emptyLabel}</option>`}
    ${M.subjects().map(s => html`<option value=${s.id}>${s.short ? `${s.short} — ${s.name}` : s.name}</option>`)}
  </select>`;
}

// ---------- Дедлайн ----------

export function DueChip({ t }) {
  if (!t.due) return null;
  const overdue = M.isOverdue(t);
  const n = Math.round((new Date(t.due) - new Date(today())) / 864e5);
  const cls = M.isDone(t) ? '' : overdue ? 'danger' : n <= 1 ? 'warn' : '';
  const label = overdue ? `просрочено · ${fmtDate(t.due)}` : `${relDay(t.due)}${n > 6 || n < 0 ? '' : ''}${t.dueTime ? ' ' + t.dueTime : ''}`;
  return html`<span class=${'chip ' + cls} title=${fmtDate(t.due, { weekday: true }) + (t.dueTime ? ' ' + t.dueTime : '')}>⏰ ${label}</span>`;
}

// ---------- Задача в списке ----------

export function TaskItem({ t, onOpen, showSubject = true }) {
  const cat = M.categoryOf(t);
  const subDone = (t.subtasks || []).filter(s => s.done).length;
  const toggle = e => {
    e.stopPropagation();
    const wasDone = M.isDone(t);
    const spawned = M.toggleTask(t);
    if (!wasDone) toast(spawned ? 'Готово. Создана следующая по повтору' : 'Задача выполнена', {
      label: 'Отменить', fn: () => { db.patch(t.id, { status: 'todo', doneAt: null, spawnedNext: false }); if (spawned) db.remove(spawned); },
    });
  };
  return html`<div class=${'task' + (M.isDone(t) ? ' done' : '') + (M.isOverdue(t) ? ' overdue' : '')}>
    <button class=${'cb' + (M.isDone(t) ? ' on' : '') + (t.priority >= 2 ? ' p' + t.priority : '')} onClick=${toggle} aria-label="Выполнено">${M.isDone(t) ? '✓' : ''}</button>
    <div class="grow">
      <div class="title" onClick=${() => onOpen(t)}>${t.title || 'Без названия'}</div>
      <div class="meta">
        ${showSubject && html`<${Chip} color=${cat.color}>${cat.name}<//>`}
        ${t.type && html`<span class="chip">${t.type}</span>`}
        <${DueChip} t=${t} />
        ${t.status === 'doing' && html`<span class="chip accent">в процессе</span>`}
        ${t.priority === 3 && html`<span class="chip danger">срочно</span>`}
        ${t.priority === 2 && html`<span class="chip warn">важно</span>`}
        ${(t.subtasks || []).length > 0 && html`<span class="chip">☑ ${subDone}/${t.subtasks.length}</span>`}
        ${(t.attachments || []).length > 0 && html`<span class="chip">📎 ${t.attachments.length}</span>`}
        ${t.repeat && html`<span class="chip">🔁</span>`}
        ${t.estimate > 0 && html`<span class="chip">~${t.estimate >= 60 ? (t.estimate / 60).toFixed(t.estimate % 60 ? 1 : 0) + ' ч' : t.estimate + ' мин'}</span>`}
      </div>
    </div>
  </div>`;
}

// ---------- Пара ----------

export function LessonItem({ o, onOpen, state }) {
  const color = M.subjColor(o.subjectId);
  return html`<div class=${'lesson' + (o.cancelled ? ' cancelled' : '') + (state ? ' ' + state : '')} style=${{ '--c': color }} onClick=${() => onOpen && onOpen(o)}>
    <div class="time"><b>${o.start}</b><span class="muted">${o.end}</span></div>
    <div class="grow">
      <div class="bold">${o.title}</div>
      <div class="meta">
        ${o.type && html`<span>${o.type}</span>`}
        ${o.room && html`<span>📍 ${o.room}</span>`}
        ${o.teachers?.length > 0 && html`<span>👤 ${o.teachers.join(', ')}</span>`}
        ${o.subgroup ? html`<span>п/гр. ${o.subgroup}</span>` : null}
        ${o.extra && html`<span class="chip accent">доп.</span>`}
        ${o.changed && html`<span class="chip warn">изменено</span>`}
        ${o.cancelled && html`<span class="chip danger">отменено</span>`}
        ${o.absent && html`<span class="chip danger">пропуск</span>`}
      </div>
      ${o.note && html`<div class="small" style="margin-top:5px">📝 ${o.note}</div>`}
    </div>
  </div>`;
}

export function lessonState(o) {
  const n = Date.now();
  const s = new Date(`${o.date}T${o.start}:00`).getTime(), e = new Date(`${o.date}T${o.end}:00`).getTime();
  return n >= e ? 'past' : n >= s ? 'now' : '';
}

export { untilText };

// ---------- Вложения ----------

const ATT_ICON = { file: '📄', url: '🔗', path: '📁', code: '💻' };

export function Attachments({ list = [], onChange }) {
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const roots = M.settings().roots;

  const add = a => { onChange([...list, { id: db.uid(), ...a }]); setAdding(null); };
  const del = a => {
    if (!confirm(`Убрать «${a.name}»?`)) return;
    if (a.type === 'file') db.deleteFile(a.path).catch(() => {});
    onChange(list.filter(x => x.id !== a.id));
  };
  const open = async a => {
    try {
      if (a.type === 'file') { window.open(await db.fileUrl(a.path), '_blank'); return; }
      const href = M.attachmentHref(a);
      if (!href) { toast('Для этого устройства не задана папка-корень (Настройки → Папки)'); return; }
      if (a.type === 'url') { window.open(href, '_blank', 'noopener'); return; }
      if (M.isMobile()) { copyPath(a); return; }
      location.href = href;
    } catch (e) { toast('Не открылось: ' + e.message); }
  };
  const copyPath = async a => {
    const p = a.type === 'url' ? a.url : M.resolvePath(a) || a.path;
    try { await navigator.clipboard.writeText(p); toast('Путь скопирован'); } catch { prompt('Скопируй путь:', p); }
  };
  const upload = async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of files) { const r = await db.uploadFile(f); added.push({ id: db.uid(), type: 'file', ...r }); }
      onChange([...list, ...added]); toast(added.length > 1 ? `Загружено файлов: ${added.length}` : 'Файл загружен');
    } catch (err) { toast('Ошибка загрузки: ' + err.message); }
    setBusy(false);
  };

  return html`<div>
    ${list.map(a => html`<div class="att" key=${a.id}>
      <span>${ATT_ICON[a.type]}</span>
      <span class="name" onClick=${() => open(a)} title=${a.type === 'url' ? a.url : a.path}>${a.name}
        ${a.type !== 'file' && a.type !== 'url' && html`<span class="muted tiny"> ${a.root ? (roots.find(r => r.id === a.root)?.name || a.root) + ' / ' : ''}${a.path}</span>`}
        ${a.type === 'file' && a.size ? html`<span class="muted tiny"> ${(a.size / 1024 / 1024).toFixed(a.size > 1e6 ? 1 : 2)} МБ</span>` : null}</span>
      ${a.type !== 'file' && html`<button class="btn sm ghost" title="Скопировать" onClick=${() => copyPath(a)}>⧉</button>`}
      <button class="btn sm ghost" title="Убрать" onClick=${() => del(a)}>✕</button>
    </div>`)}
    <div class="row" style="margin-top:8px">
      <button class="btn sm" disabled=${busy || !db.sync.user} title=${db.sync.user ? '' : 'Файлы доступны после входа в аккаунт'} onClick=${() => fileRef.current.click()}>${busy ? 'Загрузка…' : '📄 Файл'}</button>
      <button class="btn sm" onClick=${() => setAdding('url')}>🔗 Ссылка</button>
      <button class="btn sm" onClick=${() => setAdding('path')}>📁 Папка/файл на ПК</button>
      <button class="btn sm" onClick=${() => setAdding('code')}>💻 Открыть в VS Code</button>
      <input type="file" multiple hidden ref=${fileRef} onChange=${upload} />
    </div>
    ${adding && html`<${AddLink} type=${adding} roots=${roots} onAdd=${add} onCancel=${() => setAdding(null)} />`}
  </div>`;
}

function AddLink({ type, roots, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [val, setVal] = useState('');
  const [root, setRoot] = useState('');
  const submit = e => {
    e.preventDefault();
    let v = val.trim().replace(/^"(.*)"$/, '$1');
    if (!v && !root) return;
    if (type === 'url') { if (!/^[a-z][\w+.-]*:/i.test(v)) v = 'https://' + v; onAdd({ type, url: v, name: name.trim() || v.replace(/^https?:\/\//, '').slice(0, 60) }); }
    else onAdd({ type, path: v, root, name: name.trim() || v.split(/[\\/]/).filter(Boolean).pop() || roots.find(r => r.id === root)?.name || v });
  };
  return html`<form class="card" style="margin-top:10px;box-shadow:none" onSubmit=${submit}>
    <div class="stack">
      ${type === 'url'
        ? html`<${Field} label="Ссылка"><input class="input" autoFocus value=${val} onInput=${e => setVal(e.target.value)} placeholder="https://…" /><//>`
        : html`
          <div class="fields">
            <${Field} label="Относительно папки">
              <select class="input" value=${root} onChange=${e => setRoot(e.target.value)}>
                <option value="">— полный путь —</option>
                ${roots.map(r => html`<option value=${r.id}>${r.name}</option>`)}
              </select><//>
          </div>
          <${Field} label=${root ? 'Путь внутри папки (можно пусто)' : 'Полный путь'}>
            <input class="input" autoFocus value=${val} onInput=${e => setVal(e.target.value)} placeholder=${root ? 'Курсовые\\СПТУ' : 'D:\\Учёба\\СПТУ\\курсовая.docx'} /><//>
          <div class="hint-line">${type === 'code'
            ? 'Откроется в VS Code (файл или папка проекта). Подсказка: в проводнике Shift+ПКМ → «Копировать как путь».'
            : 'Откроется в проводнике. Нужно один раз установить обработчик ссылок: Настройки → Папки на этом устройстве.'}</div>`}
      <${Field} label="Название (необязательно)"><input class="input" value=${name} onInput=${e => setName(e.target.value)} /><//>
      <div class="row"><button class="btn primary sm" type="submit">Добавить</button><button class="btn sm" type="button" onClick=${onCancel}>Отмена</button></div>
    </div>
  </form>`;
}

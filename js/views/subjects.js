import { html, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Attachments, Empty, Field, Progress, TaskItem, confirmDelete, go, openModal, toast } from '../ui.js';
import { fmtDate, today } from '../date.js';
import { QuickAdd, openTask } from './tasks.js';
import { openExam } from './session.js';
import { openLesson } from './schedule.js';

const COLORS = ['#4f6bed', '#14a37f', '#8e6cef', '#e8900c', '#e5484d', '#0ea5e9', '#d946ef', '#64748b', '#a16207'];

export function SubjectsView({ parts }) {
  db.useStore();
  if (parts[1]) return html`<${SubjectPage} id=${parts[1]} />`;
  const list = M.subjects();
  const add = () => {
    const name = prompt('Название предмета:');
    if (!name?.trim()) return;
    const id = db.put('subject', { name: name.trim(), short: '', tag: '', color: COLORS[list.length % COLORS.length], control: 'Зачёт', coursework: false,
      teachers: [], links: [], requirements: '', grades: [], labsTotal: 0, labsDone: 0, notes: '', attachments: [], order: list.length });
    go('subjects/' + id);
  };
  return html`<div>
    <div class="page-head"><h1>Предметы</h1><button class="btn primary" onClick=${add}>+ Предмет</button></div>
    <div class="grid three">
      ${list.map(s => {
        const open = M.tasks().filter(t => t.subjectId === s.id && !M.isDone(t));
        const over = open.filter(M.isOverdue).length;
        const abs = M.absences(s.id).length;
        const next = M.nextLessonOf(s.id);
        const g = gradeSum(s);
        return html`<div class="card subj-card" key=${s.id} style=${{ '--c': s.color }} onClick=${() => go('subjects/' + s.id)}>
          <div class="row between"><b style=${{ color: s.color }}>${s.short || ''}</b>
            <span class=${'chip ' + (s.control === 'Экзамен' ? 'danger' : 'accent')}>${s.control}${s.coursework ? ' + КР' : ''}</span></div>
          <h3 style="margin:6px 0">${s.name}</h3>
          <div class="small muted">${(s.teachers || []).map(t => t.name).join(', ')}</div>
          <div class="row" style="margin-top:10px">
            <span class="chip">${open.length} задач</span>
            ${over > 0 && html`<span class="chip danger">${over} просрочено</span>`}
            ${abs > 0 && html`<span class=${'chip ' + (abs >= M.settings().absenceLimit ? 'danger' : 'warn')}>${abs} пропуск.</span>`}
            ${s.labsTotal > 0 && html`<span class="chip">лабы ${s.labsDone}/${s.labsTotal}</span>`}
            ${g.max > 0 && html`<span class="chip ok">${g.score}/${g.max}</span>`}
          </div>
          ${next && html`<div class="tiny muted" style="margin-top:8px">След. пара: ${fmtDate(next.date, { weekday: true })}, ${next.start} · ${next.type}</div>`}
        </div>`;
      })}
    </div>
  </div>`;
}

const gradeSum = s => (s.grades || []).reduce((a, g) => ({ score: a.score + (Number(g.score) || 0), max: a.max + (Number(g.max) || 0) }), { score: 0, max: 0 });

function SubjectPage({ id }) {
  const s = M.subject(id);
  const [tab, setTab] = useState('overview');
  if (!s) return html`<${Empty}>Предмет не найден. <a href="#/subjects">К списку</a><//>`;
  const upd = p => db.patch(id, p);
  const tabs = [['overview', 'Обзор'], ['tasks', 'Задачи'], ['grades', 'Баллы и лабы'], ['attendance', 'Посещаемость'], ['notes', 'Конспекты'], ['files', 'Файлы и ссылки']];
  return html`<div>
    <div class="page-head">
      <a class="btn icon" href="#/subjects">←</a>
      <h1 style=${{ borderLeft: `5px solid ${s.color}`, paddingLeft: 10 }}>${s.name}</h1>
      <button class="btn" onClick=${() => openModal(close => html`<${SubjectEditor} s=${s} close=${close} />`)}>Изменить</button>
    </div>
    <div class="tabs">${tabs.map(([k, n]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${n}</button>`)}</div>
    ${tab === 'overview' && html`<${Overview} s=${s} />`}
    ${tab === 'tasks' && html`<${SubjTasks} s=${s} />`}
    ${tab === 'grades' && html`<${Grades} s=${s} upd=${upd} />`}
    ${tab === 'attendance' && html`<${Attendance} s=${s} />`}
    ${tab === 'notes' && html`<${Notes} s=${s} />`}
    ${tab === 'files' && html`<div class="card"><h2>Файлы, папки и ссылки</h2><${Attachments} list=${s.attachments || []} onChange=${v => upd({ attachments: v })} /></div>`}
  </div>`;
}

function Overview({ s }) {
  const next = M.nextLessonOf(s.id);
  const exams = db.all('exam').filter(e => e.subjectId === s.id);
  const lessons = db.all('lesson').filter(l => l.subjectId === s.id);
  const DAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  return html`<div class="grid two" style="align-items:start">
    <div class="card">
      <h2>Информация</h2>
      <div class="kv">
        <span>Форма контроля</span><span>${s.control}${s.coursework ? ' + курсовая' : ''}</span>
        <span>Хэштег</span><span>${s.tag ? '#' + s.tag : '—'}</span>
        ${(s.teachers || []).map(t => html`<span>${t.role || 'Преподаватель'}</span><span>${t.name}${t.contact && html`<br/><span class="small"><${Contact} c=${t.contact} /></span>`}</span>`)}
        <span>Занятия</span><span class="small">${lessons.map(l => `${DAYS[l.day]} ${l.pair}п. ${l.week ? (l.week === 1 ? '(I)' : '(II)') : ''} ${l.type}${l.subgroup ? ' п/гр.' + l.subgroup : ''} · ${l.room}`).join('\n').split('\n').map(x => html`<div>${x}</div>`)}</span>
      </div>
      ${(s.links || []).length > 0 && html`<div class="section-title">Ссылки</div>${s.links.map(l => html`<div><a href=${l.url} target="_blank" rel="noopener">${l.name || l.url}</a></div>`)}`}
    </div>
    <div>
      ${next && html`<div class="card" style="cursor:pointer" onClick=${() => openLesson(next)}>
        <h2>Следующая пара</h2><div>${fmtDate(next.date, { weekday: true })}, ${next.start}–${next.end}</div>
        <div class="small muted">${next.type} · ауд. ${next.room}</div>${next.note && html`<div class="small" style="margin-top:6px">📝 ${next.note}</div>`}</div>`}
      <div class="card">
        <div class="row between"><h2>Сессия</h2><button class="btn sm" onClick=${() => openExam(null, { subjectId: s.id })}>+</button></div>
        ${exams.length ? exams.map(e => { const q = e.questions || []; return html`<div class="list-row" key=${e.id} style="cursor:pointer" onClick=${() => openExam(e)}>
          <span class="grow">${e.type}${e.date ? ' · ' + fmtDate(e.date) : ' · дата не назначена'}</span>
          ${q.length > 0 && html`<span class="small muted">${q.filter(x => x.learned).length}/${q.length}</span>`}</div>`; }) : html`<div class="muted small">Нет</div>`}
      </div>
      <div class="card"><h2>Требования к зачёту / экзамену</h2>
        <textarea class="input" key=${s.id} placeholder="Что нужно для допуска, критерии, сколько лаб…" defaultValue=${s.requirements || ''} onBlur=${e => e.target.value !== (s.requirements || '') && db.patch(s.id, { requirements: e.target.value })}></textarea>
      </div>
    </div>
  </div>`;
}

const Contact = ({ c }) => /^\S+@\S+$/.test(c) ? html`<a href=${'mailto:' + c}>${c}</a>`
  : /^@?\w{4,}$/.test(c) && !/^\d+$/.test(c) ? html`<a href=${'https://t.me/' + c.replace('@', '')} target="_blank">${c}</a>`
  : /^https?:/.test(c) ? html`<a href=${c} target="_blank">${c}</a>` : html`<span>${c}</span>`;

function SubjTasks({ s }) {
  const [showDone, setShowDone] = useState(false);
  const list = M.sortTasks(M.tasks().filter(t => t.subjectId === s.id && (showDone || !M.isDone(t))));
  return html`<div>
    <div class="card"><${QuickAdd} preset=${{ subjectId: s.id }} /></div>
    <div class="row between" style="margin:14px 0 8px"><label class="check small"><input type="checkbox" checked=${showDone} onChange=${() => setShowDone(!showDone)} /> показывать выполненные</label>
      <button class="btn sm" onClick=${() => openTask(null, { category: 'study', subjectId: s.id })}>+ Подробно</button></div>
    ${list.length ? list.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} showSubject=${false} />`) : html`<${Empty}>Задач нет<//>`}
  </div>`;
}

function Grades({ s, upd }) {
  const grades = s.grades || [];
  const g = gradeSum(s);
  const [n, setN] = useState({ title: '', score: '', max: '' });
  const add = e => { e.preventDefault(); if (!n.title.trim()) return; upd({ grades: [...grades, { id: db.uid(), title: n.title.trim(), score: Number(n.score) || 0, max: Number(n.max) || 0, date: today() }] }); setN({ title: '', score: '', max: '' }); };
  const pct = g.max ? Math.round((g.score / g.max) * 100) : null;
  return html`<div class="grid two" style="align-items:start">
    <div class="card">
      <h2>Лабораторные</h2>
      <div class="row"><span class="stat-num">${s.labsDone || 0}</span><span class="muted">из</span>
        <input class="input" type="number" min="0" style="width:80px" value=${s.labsTotal || 0} onInput=${e => upd({ labsTotal: Number(e.target.value) || 0 })} />
        <button class="btn" onClick=${() => upd({ labsDone: Math.max(0, (s.labsDone || 0) - 1) })}>−</button>
        <button class="btn primary" onClick=${() => upd({ labsDone: (s.labsDone || 0) + 1 })}>+ сдал</button></div>
      ${s.labsTotal > 0 && html`<div style="margin-top:10px"><${Progress} value=${s.labsDone} max=${s.labsTotal} /></div>`}
    </div>
    <div class="card">
      <h2>Баллы и оценки</h2>
      ${g.max > 0 && html`<div class="row" style="margin-bottom:8px"><span class="stat-num">${g.score}</span><span class="muted">из ${g.max} (${pct}%)</span></div>
        <${Progress} value=${g.score} max=${g.max} />
        <div class="small muted" style="margin-top:6px">Если так пойдёт дальше: ${pct >= 85 ? 'отлично' : pct >= 70 ? 'хорошо' : pct >= 50 ? 'удовлетворительно' : 'пока ниже порога'}</div>`}
      ${grades.map(x => html`<div class="list-row" key=${x.id}><span class="grow">${x.title}</span><span class="tiny muted">${fmtDate(x.date)}</span><b>${x.score}${x.max ? '/' + x.max : ''}</b>
        <button class="btn sm ghost" onClick=${() => upd({ grades: grades.filter(y => y.id !== x.id) })}>✕</button></div>`)}
      <form class="row" style="margin-top:10px;flex-wrap:nowrap" onSubmit=${add}>
        <input class="input" placeholder="За что (лаба 1, тест)" value=${n.title} onInput=${e => setN({ ...n, title: e.target.value })} />
        <input class="input" style="width:70px" placeholder="балл" value=${n.score} onInput=${e => setN({ ...n, score: e.target.value })} />
        <input class="input" style="width:70px" placeholder="из" value=${n.max} onInput=${e => setN({ ...n, max: e.target.value })} />
        <button class="btn">+</button></form>
    </div>
  </div>`;
}

function Attendance({ s }) {
  const st = M.settings();
  const abs = M.absences(s.id).sort((a, b) => b.date.localeCompare(a.date));
  return html`<div class="card">
    <h2>Пропуски: ${abs.length}${abs.length >= st.absenceLimit ? html` <span class="chip danger">многовато</span>` : ''}</h2>
    <div class="small muted" style="margin-bottom:10px">Отмечай пропуск в карточке пары (клик по паре в расписании). Порог предупреждения — ${st.absenceLimit}, меняется в настройках.</div>
    ${abs.length ? abs.map(o => html`<div class="list-row" key=${o.id}><span>${fmtDate(o.date, { weekday: true })}</span><span class="muted small grow">${db.get(o.lessonId)?.type || ''}</span>
      <button class="btn sm" onClick=${() => M.setOccurrence(o.lessonId, o.date, { absent: false })}>Убрать</button></div>`) : html`<${Empty}>Пропусков нет 👍<//>`}
  </div>`;
}

function Notes({ s }) {
  const notes = db.all('note').filter(n => n.subjectId === s.id).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const [openId, setOpenId] = useState(null);
  const cur = notes.find(n => n.id === openId);
  const create = () => setOpenId(db.put('note', { subjectId: s.id, title: 'Конспект ' + fmtDate(today()), body: '', updated: Date.now() }));
  return html`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));align-items:start">
    <div class="card">
      <button class="btn primary" style="width:100%;margin-bottom:8px" onClick=${create}>+ Конспект</button>
      ${notes.map(n => html`<div class="list-row" key=${n.id} style=${{ cursor: 'pointer', fontWeight: n.id === openId ? 600 : 400 }} onClick=${() => setOpenId(n.id)}>
        <span class="grow ellipsis">${n.title || 'Без названия'}</span><span class="tiny muted">${fmtDate(new Date(n.updated || Date.now()).toISOString().slice(0, 10))}</span></div>`)}
      ${notes.length === 0 && html`<div class="muted small">Пока пусто</div>`}
    </div>
    ${cur ? html`<${NoteEditor} key=${cur.id} n=${cur} onDelete=${() => { db.remove(cur.id); setOpenId(null); toast('Удалено', { label: 'Вернуть', fn: () => db.restore(cur.id) }); }} />`
      : html`<div class="card"><${Empty}>Выбери конспект слева или создай новый<//></div>`}
  </div>`;
}

function NoteEditor({ n, onDelete }) {
  const [title, setTitle] = useState(n.title);
  const [body, setBody] = useState(n.body);
  const save = () => { if (title !== n.title || body !== n.body) db.patch(n.id, { title, body, updated: Date.now() }); };
  return html`<div class="card stack">
    <input class="input" style="font-weight:600;font-size:16px" value=${title} onInput=${e => setTitle(e.target.value)} onBlur=${save} />
    <textarea class="input" style="min-height:360px;font-family:ui-monospace,Consolas,monospace;font-size:14px" value=${body} onInput=${e => setBody(e.target.value)} onBlur=${save} placeholder="Пиши здесь… сохраняется автоматически"></textarea>
    <div class="row between"><span class="tiny muted">Сохраняется при выходе из поля</span><button class="btn sm danger" onClick=${() => confirmDelete('конспект', onDelete)}>Удалить</button></div>
    <div><div class="section-title">Вложения</div><${AttachNote} n=${n} /></div>
  </div>`;
}
const AttachNote = ({ n }) => html`<${Attachments} list=${n.attachments || []} onChange=${v => db.patch(n.id, { attachments: v })} />`;

function SubjectEditor({ s, close }) {
  const [f, setF] = useState(() => ({ ...s, teachers: (s.teachers || []).map(t => ({ ...t })), links: (s.links || []).map(l => ({ ...l })) }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = e => { e.preventDefault(); const { id, ...data } = f; db.put('subject', { ...data, tag: (f.tag || '').replace(/^#/, '').toLowerCase() }, s.id); close(); };
  return html`<form onSubmit=${save}>
    <h2>Предмет</h2>
    <div class="stack" style="gap:12px">
      <${Field} label="Название"><input class="input" value=${f.name} onInput=${e => set('name', e.target.value)} /><//>
      <div class="fields">
        <${Field} label="Сокращение"><input class="input" value=${f.short} onInput=${e => set('short', e.target.value)} /><//>
        <${Field} label="Хэштег для быстрого ввода"><input class="input" value=${f.tag} onInput=${e => set('tag', e.target.value)} /><//>
        <${Field} label="Форма контроля"><select class="input" value=${f.control} onChange=${e => set('control', e.target.value)}>
          ${['Зачёт', 'Диф. зачёт', 'Экзамен'].map(x => html`<option>${x}</option>`)}</select><//>
      </div>
      <label class="check"><input type="checkbox" checked=${f.coursework} onChange=${() => set('coursework', !f.coursework)} /> Есть курсовая</label>
      <div class="row">${COLORS.map(c => html`<button type="button" style=${{ width: 26, height: 26, borderRadius: 13, border: f.color === c ? '3px solid var(--text)' : '0', background: c, cursor: 'pointer' }} onClick=${() => set('color', c)}></button>`)}</div>
      <div class="section-title" style="margin:4px 0 0">Преподаватели</div>
      ${f.teachers.map((t, i) => html`<div class="row" key=${i} style="flex-wrap:nowrap">
        <input class="input" placeholder="ФИО" value=${t.name} onInput=${e => set('teachers', f.teachers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
        <input class="input" placeholder="роль" value=${t.role} onInput=${e => set('teachers', f.teachers.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
        <input class="input" placeholder="почта / @telegram" value=${t.contact} onInput=${e => set('teachers', f.teachers.map((x, j) => j === i ? { ...x, contact: e.target.value } : x))} />
        <button type="button" class="btn sm ghost" onClick=${() => set('teachers', f.teachers.filter((_, j) => j !== i))}>✕</button></div>`)}
      <button type="button" class="btn sm" onClick=${() => set('teachers', [...f.teachers, { name: '', role: '', contact: '' }])}>+ Преподаватель</button>
      <div class="section-title" style="margin:4px 0 0">Ссылки (Moodle, чат группы, диск)</div>
      ${f.links.map((l, i) => html`<div class="row" key=${i} style="flex-wrap:nowrap">
        <input class="input" placeholder="Название" value=${l.name} onInput=${e => set('links', f.links.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
        <input class="input" placeholder="https://…" value=${l.url} onInput=${e => set('links', f.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
        <button type="button" class="btn sm ghost" onClick=${() => set('links', f.links.filter((_, j) => j !== i))}>✕</button></div>`)}
      <button type="button" class="btn sm" onClick=${() => set('links', [...f.links, { name: '', url: '' }])}>+ Ссылка</button>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn danger" style="margin-right:auto" onClick=${() => confirmDelete('предмет (задачи останутся)', () => { db.remove(s.id); close(); go('subjects'); })}>Удалить</button>
      <button type="button" class="btn" onClick=${close}>Отмена</button><button class="btn primary">Сохранить</button>
    </div>
  </form>`;
}

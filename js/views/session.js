import { html, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Empty, Field, Progress, SubjectSelect, confirmDelete, openModal, toast } from '../ui.js';
import { diffDays, fmtDate, plural, today, untilText } from '../date.js';

const EXAM_TYPES = ['Экзамен', 'Зачёт', 'Диф. зачёт', 'Защита курсовой', 'Консультация', 'Контрольная'];

export function openExam(e, preset = {}) { openModal(close => html`<${ExamEditor} exam=${e} preset=${preset} close=${close} />`); }

function ExamEditor({ exam, preset, close }) {
  const [e, setE] = useState(() => exam ? { ...exam } : { subjectId: '', type: 'Экзамен', date: '', time: '', room: '', notes: '', questions: [], ...preset });
  const [bulk, setBulk] = useState('');
  const set = (k, v) => setE(x => ({ ...x, [k]: v }));
  const qs = e.questions || [];
  const learned = qs.filter(q => q.learned).length;
  const addBulk = () => {
    const lines = bulk.split('\n').map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    set('questions', [...qs, ...lines.map(text => ({ id: db.uid(), text, learned: false }))]); setBulk('');
  };
  const save = x => { x?.preventDefault(); if (exam) db.put('exam', e, exam.id); else db.put('exam', e); close(); };
  return html`<form onSubmit=${save}>
    <h2>${exam ? `${e.type}: ${M.subjShort(e.subjectId)}` : 'Новое испытание'}</h2>
    <div class="stack" style="gap:12px">
      <div class="fields">
        <${Field} label="Предмет"><${SubjectSelect} value=${e.subjectId} onChange=${v => set('subjectId', v)} /><//>
        <${Field} label="Тип"><select class="input" value=${e.type} onChange=${x => set('type', x.target.value)}>${EXAM_TYPES.map(t => html`<option>${t}</option>`)}</select><//>
      </div>
      <div class="fields">
        <${Field} label="Дата"><input class="input" type="date" value=${e.date} onInput=${x => set('date', x.target.value)} /><//>
        <${Field} label="Время"><input class="input" type="time" value=${e.time} onInput=${x => set('time', x.target.value)} /><//>
        <${Field} label="Аудитория"><input class="input" value=${e.room} onInput=${x => set('room', x.target.value)} /><//>
      </div>
      <${Field} label="Заметки (формат, что можно с собой, критерии)"><textarea class="input" value=${e.notes} onInput=${x => set('notes', x.target.value)}></textarea><//>
      <div>
        <div class="row between"><div class="section-title" style="margin:0">Вопросы · ${learned}/${qs.length}</div>
          ${qs.length > 0 && html`<span class="small muted">${Math.round((learned / qs.length) * 100)}% готовности</span>`}</div>
        ${qs.length > 0 && html`<div style="margin:8px 0"><${Progress} value=${learned} max=${qs.length} /></div>`}
        <div style="max-height:300px;overflow-y:auto">
        ${qs.map((q, i) => html`<div class="row" key=${q.id} style="margin:3px 0;flex-wrap:nowrap">
          <label class="check grow" style="align-items:flex-start"><input type="checkbox" checked=${q.learned} onChange=${() => set('questions', qs.map(x => x.id === q.id ? { ...x, learned: !x.learned } : x))} />
            <span class="small" style=${q.learned ? 'color:var(--muted)' : ''}>${i + 1}. ${q.text}</span></label>
          <button type="button" class="btn sm ghost" onClick=${() => set('questions', qs.filter(x => x.id !== q.id))}>✕</button></div>`)}
        </div>
        <textarea class="input" style="margin-top:8px;min-height:60px" placeholder="Вставь список вопросов — каждый с новой строки" value=${bulk} onInput=${x => setBulk(x.target.value)}></textarea>
        <button type="button" class="btn sm" style="margin-top:6px" onClick=${addBulk}>Добавить вопросы</button>
      </div>
    </div>
    <div class="modal-foot">
      ${exam && html`<button type="button" class="btn danger" style="margin-right:auto" onClick=${() => confirmDelete('запись', () => { db.remove(exam.id); close(); toast('Удалено', { label: 'Вернуть', fn: () => db.restore(exam.id) }); })}>Удалить</button>`}
      <button type="button" class="btn" onClick=${close}>Отмена</button><button class="btn primary">Сохранить</button>
    </div>
  </form>`;
}

export function SessionView() {
  db.useStore();
  const td = today();
  const all = db.all('exam').slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.type.localeCompare(b.type));
  const upcoming = all.filter(e => !e.date || e.date >= td);
  const past = all.filter(e => e.date && e.date < td);
  const totalQ = upcoming.reduce((s, e) => s + (e.questions || []).length, 0);
  const learnedQ = upcoming.reduce((s, e) => s + (e.questions || []).filter(q => q.learned).length, 0);
  const st = M.settings();

  return html`<div>
    <div class="page-head"><h1>Сессия</h1><button class="btn primary" onClick=${() => openExam(null)}>+ Добавить</button></div>
    <div class="grid three" style="margin-bottom:14px">
      <div class="card"><div class="muted small">До конца семестра</div><div class="stat-num">${Math.max(0, diffDays(td, st.semesterEnd))} ${plural(diffDays(td, st.semesterEnd), 'день', 'дня', 'дней')}</div></div>
      <div class="card"><div class="muted small">Ближайшее</div>${upcoming.find(e => e.date)
        ? (e => html`<div class="stat-num">${diffDays(td, e.date)} дн.</div><div class="small">${e.type}: ${M.subjShort(e.subjectId)}</div>`)(upcoming.find(e => e.date))
        : html`<div class="small muted" style="margin-top:6px">Даты пока не назначены</div>`}</div>
      <div class="card"><div class="muted small">Готовность по вопросам</div><div class="stat-num">${totalQ ? Math.round((learnedQ / totalQ) * 100) : 0}%</div><${Progress} value=${learnedQ} max=${totalQ} /></div>
    </div>
    ${upcoming.length === 0 && html`<${Empty}>Пока ничего<//>`}
    <div class="grid two">
      ${upcoming.map(e => {
        const qs = e.questions || [], l = qs.filter(q => q.learned).length;
        const s = M.subject(e.subjectId);
        const n = e.date ? diffDays(td, e.date) : null;
        return html`<div class="card subj-card" key=${e.id} style=${{ '--c': s?.color }} onClick=${() => openExam(e)}>
          <div class="row between"><span class=${'chip ' + (e.type === 'Экзамен' ? 'danger' : e.type.startsWith('Защита') ? 'warn' : 'accent')}>${e.type}</span>
            ${n != null ? html`<span class=${'chip ' + (n <= 3 ? 'danger' : n <= 10 ? 'warn' : '')}>${n === 0 ? 'сегодня' : `через ${n} дн.`}</span>` : html`<span class="chip">дата не назначена</span>`}</div>
          <h3 style="margin:10px 0 4px">${s?.name || 'Без предмета'}</h3>
          <div class="small muted">${e.date ? `${fmtDate(e.date, { weekday: true })}${e.time ? ', ' + e.time : ''}${e.room ? ' · ауд. ' + e.room : ''}` : 'Нажми, чтобы указать дату'}</div>
          ${e.date && e.time && n <= 2 ? html`<div class="small" style="margin-top:4px">${untilText(e.date, e.time)}</div>` : null}
          ${qs.length > 0 && html`<div style="margin-top:10px"><div class="row between small"><span>Вопросы</span><span>${l}/${qs.length}</span></div><${Progress} value=${l} max=${qs.length} /></div>`}
        </div>`;
      })}
    </div>
    ${past.length > 0 && html`<div class="section-title">Прошедшие</div>
      ${past.map(e => html`<div class="list-row" key=${e.id} style="cursor:pointer" onClick=${() => openExam(e)}>
        <span class="chip">${fmtDate(e.date)}</span><span>${e.type}: ${M.subject(e.subjectId)?.name}</span>${e.result && html`<b>${e.result}</b>`}</div>`)}`}
  </div>`;
}

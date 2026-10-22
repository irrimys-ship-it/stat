// Фокус (помодоро), привычки, бюджет, статистика, поиск.

import { html, useEffect, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Empty, Field, Seg, SubjectSelect, TaskItem, confirmDelete, go, openModal, toast } from '../ui.js';
import { DOW, MONTHS, addDays, fmtDate, fmtDur, mondayOf, pad, today, weekday } from '../date.js';
import { openTask } from './tasks.js';
import { openEvent } from './calendar.js';
import { openExam } from './session.js';

// ---------- Фокус ----------
// Состояние таймера живёт в localStorage, поэтому переживает перезагрузку страницы.

const TIMER_KEY = 'focus.timer';
const loadTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || null; } catch { return null; } };
const saveTimer = t => (t ? localStorage.setItem(TIMER_KEY, JSON.stringify(t)) : localStorage.removeItem(TIMER_KEY));

export function FocusView() {
  db.useStore();
  const [cfg, setCfg] = useState(() => { try { return JSON.parse(localStorage.getItem('focus.cfg')) || { work: 25, brk: 5 }; } catch { return { work: 25, brk: 5 }; } });
  const [timer, setTimer] = useState(loadTimer);
  const [subjectId, setSubjectId] = useState(timer?.subjectId || '');
  const [taskId, setTaskId] = useState(timer?.taskId || '');
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i); }, []);
  useEffect(() => localStorage.setItem('focus.cfg', JSON.stringify(cfg)), [cfg]);

  const total = timer ? timer.minutes * 60 : cfg.work * 60;
  const elapsed = timer ? (timer.paused ? timer.acc : timer.acc + (Date.now() - timer.started) / 1000) : 0;
  const left = Math.max(0, total - elapsed);

  useEffect(() => { if (timer && left <= 0) finish(true); });

  const start = (phase = 'work') => {
    const t = { phase, minutes: phase === 'work' ? cfg.work : cfg.brk, started: Date.now(), acc: 0, paused: false, subjectId, taskId };
    saveTimer(t); setTimer(t);
  };
  const pause = () => { const t = timer.paused ? { ...timer, paused: false, started: Date.now() } : { ...timer, paused: true, acc: elapsed }; saveTimer(t); setTimer(t); };
  const finish = (natural = false) => {
    const t = timer; saveTimer(null); setTimer(null);
    const mins = Math.round(Math.min(elapsed, total) / 60);
    if (t.phase === 'work' && mins >= 1) {
      db.put('focus', { subjectId: t.subjectId, taskId: t.taskId, minutes: mins, date: today(), at: Date.now() });
      toast(`Записано ${fmtDur(mins)} фокуса`);
    }
    if (natural) {
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play(); } catch {}
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(t.phase === 'work' ? 'Помодоро завершён — перерыв!' : 'Перерыв окончен — за работу');
    }
  };

  const R = 110, C = 2 * Math.PI * R;
  const frac = timer ? left / total : 1;
  const tasks = M.sortTasks(M.tasks().filter(t => !M.isDone(t) && (!subjectId || t.subjectId === subjectId)));
  const logs = db.all('focus');
  const todayMin = logs.filter(f => f.date === today()).reduce((s, f) => s + f.minutes, 0);
  const weekMin = logs.filter(f => f.date >= mondayOf(today())).reduce((s, f) => s + f.minutes, 0);

  return html`<div>
    <div class="page-head"><h1>Фокус</h1></div>
    <div class="grid two" style="align-items:start">
      <div class="card">
        <div class="ring">
          <svg width="240" height="240"><circle cx="120" cy="120" r=${R} fill="none" stroke="var(--surface-2)" stroke-width="12" />
            <circle cx="120" cy="120" r=${R} fill="none" stroke=${timer?.phase === 'break' ? 'var(--ok)' : 'var(--accent)'} stroke-width="12" stroke-linecap="round"
              stroke-dasharray=${C} stroke-dashoffset=${C * (1 - frac)} style="transition:stroke-dashoffset 1s linear" /></svg>
          <div class="timer">${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</div>
        </div>
        <div class="row" style="justify-content:center;margin-top:14px">
          ${!timer && html`<button class="btn primary" onClick=${() => start('work')}>▶ Работа ${cfg.work} мин</button><button class="btn" onClick=${() => start('break')}>☕ Перерыв ${cfg.brk}</button>`}
          ${timer && html`<button class="btn primary" onClick=${pause}>${timer.paused ? '▶ Продолжить' : '⏸ Пауза'}</button><button class="btn" onClick=${() => finish(false)}>⏹ Завершить</button>`}
        </div>
        ${timer && html`<div class="center small muted" style="text-align:center;margin-top:8px">${timer.phase === 'work' ? 'Работа' : 'Перерыв'}${timer.subjectId ? ' · ' + M.subjShort(timer.subjectId) : ''}${timer.taskId && M.tasks().find(t => t.id === timer.taskId) ? ' · ' + M.tasks().find(t => t.id === timer.taskId).title : ''}</div>`}
      </div>
      <div class="card stack">
        <h2>Настройка</h2>
        <div class="fields">
          <${Field} label="Работа (мин)"><input class="input" type="number" min="1" value=${cfg.work} onInput=${e => setCfg({ ...cfg, work: Number(e.target.value) || 25 })} /><//>
          <${Field} label="Перерыв (мин)"><input class="input" type="number" min="1" value=${cfg.brk} onInput=${e => setCfg({ ...cfg, brk: Number(e.target.value) || 5 })} /><//>
        </div>
        <${Field} label="Предмет"><${SubjectSelect} value=${subjectId} onChange=${v => { setSubjectId(v); setTaskId(''); }} emptyLabel="— без предмета —" /><//>
        <${Field} label="Задача"><select class="input" value=${taskId} onChange=${e => setTaskId(e.target.value)}>
          <option value="">—</option>${tasks.map(t => html`<option value=${t.id}>${t.title}</option>`)}</select><//>
        <div class="row" style="margin-top:6px"><span class="chip accent">сегодня ${fmtDur(todayMin)}</span><span class="chip">неделя ${fmtDur(weekMin)}</span></div>
      </div>
    </div>
  </div>`;
}

// ---------- Привычки ----------

export function HabitsView() {
  db.useStore();
  const habits = db.all('habit');
  const td = today();
  const days = Array.from({ length: 28 }, (_, i) => addDays(td, i - 27));
  const toggle = (h, d) => { const log = { ...(h.log || {}) }; if (log[d]) delete log[d]; else log[d] = true; db.patch(h.id, { log }); };
  const streak = h => { let n = 0, d = td; if (!(h.log || {})[d]) d = addDays(d, -1); while ((h.log || {})[d]) { n++; d = addDays(d, -1); } return n; };
  const add = () => { const t = prompt('Привычка (например: «Читать 20 минут»):'); if (t?.trim()) db.put('habit', { title: t.trim(), emoji: '⭐', log: {} }); };
  return html`<div>
    <div class="page-head"><h1>Привычки</h1><button class="btn primary" onClick=${add}>+ Привычка</button></div>
    ${habits.length === 0 && html`<${Empty}>Нет привычек<//>`}
    <div class="grid two">
      ${habits.map(h => html`<div class="card" key=${h.id}>
        <div class="row between">
          <h3 style="margin:0">${h.emoji} ${h.title}</h3>
          <div class="row"><span class="chip ok">🔥 ${streak(h)}</span>
            <button class="btn sm ghost" onClick=${() => { const t = prompt('Название:', h.title); const e = t != null ? prompt('Эмодзи:', h.emoji) : null; if (t) db.patch(h.id, { title: t, emoji: e || h.emoji }); }}>✎</button>
            <button class="btn sm ghost" onClick=${() => confirmDelete('привычку', () => db.remove(h.id))}>✕</button></div>
        </div>
        <div class="habit-days" style="margin-top:10px">
          ${DOW.map(d => html`<span class="tiny muted" style="text-align:center">${d}</span>`)}
          ${Array.from({ length: weekday(days[0]) - 1 }, () => html`<span></span>`)}
          ${days.map(d => html`<button key=${d} class=${'habit-day' + ((h.log || {})[d] ? ' on' : '') + (d === td ? ' today' : '')} title=${fmtDate(d)} onClick=${() => toggle(h, d)}>${Number(d.slice(8))}</button>`)}
        </div>
        <div class="tiny muted" style="margin-top:8px">За 28 дней: ${days.filter(d => (h.log || {})[d]).length}</div>
      </div>`)}
    </div>
  </div>`;
}

// ---------- Бюджет ----------

export function BudgetView() {
  db.useStore();
  const st = M.settings();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [f, setF] = useState({ type: 'out', amount: '', category: st.moneyCategories[0], note: '', date: today() });
  const all = db.all('money');
  const list = all.filter(x => (x.date || '').startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const inc = list.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const out = list.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
  const balance = all.reduce((s, x) => s + (x.type === 'in' ? x.amount : -x.amount), 0);
  const byCat = {}; for (const x of list) if (x.type === 'out') byCat[x.category] = (byCat[x.category] || 0) + x.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const add = e => {
    e.preventDefault();
    const amount = Number(String(f.amount).replace(',', '.'));
    if (!amount) return;
    db.put('money', { ...f, amount, at: Date.now() }); setF({ ...f, amount: '', note: '' });
  };
  const shift = n => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const money = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  const [y, m] = month.split('-').map(Number);
  return html`<div>
    <div class="page-head"><h1>Бюджет</h1>
      <div class="row"><button class="btn icon" onClick=${() => shift(-1)}>←</button><b style="text-transform:capitalize">${MONTHS[m - 1]} ${y}</b><button class="btn icon" onClick=${() => shift(1)}>→</button></div></div>
    <div class="grid three" style="margin-bottom:14px">
      <div class="card"><div class="muted small">Доходы за месяц</div><div class="stat-num ok-text">${money(inc)}</div></div>
      <div class="card"><div class="muted small">Расходы за месяц</div><div class="stat-num danger-text">${money(out)}</div></div>
      <div class="card"><div class="muted small">Остаток (всего)</div><div class="stat-num">${money(balance)}</div></div>
    </div>
    <div class="grid two" style="align-items:start">
      <div class="card">
        <form class="stack" onSubmit=${add}>
          <${Seg} value=${f.type} onChange=${v => setF({ ...f, type: v, category: (v === 'in' ? st.incomeCategories : st.moneyCategories)[0] })} options=${[['out', 'Расход'], ['in', 'Доход']]} />
          <div class="fields">
            <${Field} label="Сумма"><input class="input" inputmode="decimal" value=${f.amount} onInput=${e => setF({ ...f, amount: e.target.value })} placeholder="0" /><//>
            <${Field} label="Категория"><select class="input" value=${f.category} onChange=${e => setF({ ...f, category: e.target.value })}>
              ${(f.type === 'in' ? st.incomeCategories : st.moneyCategories).map(c => html`<option>${c}</option>`)}</select><//>
            <${Field} label="Дата"><input class="input" type="date" value=${f.date} onInput=${e => setF({ ...f, date: e.target.value })} /><//>
          </div>
          <input class="input" placeholder="Комментарий" value=${f.note} onInput=${e => setF({ ...f, note: e.target.value })} />
          <button class="btn primary">Добавить</button>
        </form>
        ${cats.length > 0 && html`<div class="section-title">Куда ушли деньги</div>
          ${cats.map(([c, v]) => html`<div class="hbar" key=${c}><span style="width:110px">${c}</span><div class="track"><div style=${{ width: (v / cats[0][1]) * 100 + '%' }}></div></div><span class="small">${money(v)}</span></div>`)}`}
      </div>
      <div class="card">
        <h2>Операции</h2>
        ${list.length ? list.map(x => html`<div class="list-row" key=${x.id}>
          <span class="tiny muted" style="width:60px">${fmtDate(x.date)}</span>
          <span class="grow"><span class="small">${x.category}</span>${x.note && html`<span class="muted small"> · ${x.note}</span>`}</span>
          <b class=${x.type === 'in' ? 'ok-text' : ''}>${x.type === 'in' ? '+' : '−'}${money(x.amount)}</b>
          <button class="btn sm ghost" onClick=${() => { db.remove(x.id); toast('Удалено', { label: 'Вернуть', fn: () => db.restore(x.id) }); }}>✕</button></div>`) : html`<${Empty}>Пусто<//>`}
      </div>
    </div>
  </div>`;
}

// ---------- Статистика ----------

export function StatsView() {
  db.useStore();
  const td = today();
  const tasks = M.tasks();
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(td), -7 * (7 - i)));
  const doneBy = weeks.map(w => tasks.filter(t => t.doneAt && isoOf(t.doneAt) >= w && isoOf(t.doneAt) < addDays(w, 7)).length);
  const maxW = Math.max(1, ...doneBy);
  const days = Array.from({ length: 14 }, (_, i) => addDays(td, i - 13));
  const doneD = days.map(d => tasks.filter(t => t.doneAt && isoOf(t.doneAt) === d).length);
  const maxD = Math.max(1, ...doneD);
  // Стрик: подряд дней без просроченных к концу дня задач (по дате выполнения)
  let streak = 0;
  for (let d = addDays(td, -1); streak < 365; d = addDays(d, -1)) {
    const lateThatDay = tasks.some(t => t.due === d && (!t.doneAt || isoOf(t.doneAt) > d));
    if (lateThatDay) break; streak++;
    if (d < M.settings().semesterStart) break;
  }
  const focus = db.all('focus');
  const bySubj = {}; for (const f of focus) bySubj[f.subjectId || ''] = (bySubj[f.subjectId || ''] || 0) + f.minutes;
  const fs = Object.entries(bySubj).sort((a, b) => b[1] - a[1]);
  const totalDone = tasks.filter(M.isDone).length;
  const onTime = tasks.filter(t => M.isDone(t) && t.due && t.doneAt && isoOf(t.doneAt) <= t.due).length;
  const withDue = tasks.filter(t => M.isDone(t) && t.due).length;
  const subjLoad = M.subjects().map(s => [s, tasks.filter(t => t.subjectId === s.id && !M.isDone(t)).length]).sort((a, b) => b[1] - a[1]);
  const maxL = Math.max(1, ...subjLoad.map(x => x[1]));

  return html`<div>
    <div class="page-head"><h1>Статистика</h1></div>
    <div class="grid three" style="margin-bottom:14px">
      <div class="card"><div class="muted small">Выполнено всего</div><div class="stat-num">${totalDone}</div></div>
      <div class="card"><div class="muted small">Вовремя</div><div class="stat-num">${withDue ? Math.round((onTime / withDue) * 100) : 0}%</div><div class="tiny muted">${onTime} из ${withDue} со сроком</div></div>
      <div class="card"><div class="muted small">Дней без просрочек подряд</div><div class="stat-num ok-text">🔥 ${streak}</div></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Выполнено по неделям</h2>
        <div class="bars">${weeks.map((w, i) => html`<div class="bar" key=${w}><span>${doneBy[i] || ''}</span><div style=${{ height: (doneBy[i] / maxW) * 100 + '%' }}></div><span>${fmtDate(w).replace(/ .*/, '')}.${w.slice(5, 7)}</span></div>`)}</div></div>
      <div class="card"><h2>Последние 14 дней</h2>
        <div class="bars">${days.map((d, i) => html`<div class="bar" key=${d}><span>${doneD[i] || ''}</span><div style=${{ height: (doneD[i] / maxD) * 100 + '%', background: d === td ? 'var(--ok)' : undefined }}></div><span>${Number(d.slice(8))}</span></div>`)}</div></div>
      <div class="card"><h2>Открытые задачи по предметам</h2>
        ${subjLoad.map(([s, n]) => html`<div class="hbar" key=${s.id} style=${{ '--c': s.color }}><span style="width:70px">${s.short || s.name}</span><div class="track"><div style=${{ width: (n / maxL) * 100 + '%' }}></div></div><span class="small">${n}</span></div>`)}</div>
      <div class="card"><h2>Время фокуса по предметам</h2>
        ${fs.length ? fs.map(([id, m]) => html`<div class="hbar" key=${id} style=${{ '--c': M.subjColor(id) }}><span style="width:70px">${id ? M.subjShort(id) : 'Другое'}</span><div class="track"><div style=${{ width: (m / fs[0][1]) * 100 + '%' }}></div></div><span class="small">${fmtDur(m)}</span></div>`)
          : html`<div class="muted small">Запусти таймер в разделе «Фокус»</div>`}</div>
    </div>
  </div>`;
}
const isoOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ---------- Поиск ----------

export function SearchView() {
  db.useStore();
  const [q, setQ] = useState('');
  const res = M.searchAll(q);
  const open = r => {
    if (r.type === 'task') openTask(r.item);
    else if (r.type === 'subject') go('subjects/' + r.item.id);
    else if (r.type === 'note') go('subjects/' + r.item.subjectId);
    else if (r.type === 'event') openEvent(r.item);
    else if (r.type === 'exam') openExam(r.item);
    else if (r.type === 'occ') go('calendar?d=' + r.item.date);
  };
  const label = { task: 'Задача', subject: 'Предмет', note: 'Конспект', event: 'Событие', exam: 'Сессия', occ: 'Заметка к паре' };
  const title = r => r.type === 'occ' ? `${fmtDate(r.item.date)}: ${r.item.note}` : r.type === 'exam' ? `${r.item.type}: ${M.subjShort(r.item.subjectId)}` : r.item.title || r.item.name;
  return html`<div>
    <div class="page-head"><h1>Поиск</h1></div>
    <input class="input" style="font-size:17px" autoFocus placeholder="Задачи, предметы, конспекты, заметки, вопросы…" value=${q} onInput=${e => setQ(e.target.value)} />
    <div class="card" style="margin-top:14px">
      ${q.trim().length < 2 ? html`<${Empty}>Введи хотя бы 2 символа<//>` : res.length === 0 ? html`<${Empty}>Ничего не найдено<//>`
        : res.map((r, i) => html`<div class="list-row" key=${i} style="cursor:pointer" onClick=${() => open(r)}><span class="chip">${label[r.type]}</span><span class="grow ellipsis">${title(r)}</span></div>`)}
    </div>
  </div>`;
}

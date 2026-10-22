import { html, useEffect, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Empty, LessonItem, TaskItem, go, lessonState } from '../ui.js';
import { DOW_FULL, addDays, diffDays, fmtDate, fmtDur, today, untilText, weekday } from '../date.js';
import { QuickAdd, openTask } from './tasks.js';
import { openLesson } from './schedule.js';

function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function TodayView() {
  db.useStore(); useTick();
  const td = today();
  const { current, next } = M.nowAndNext();
  const lessons = M.lessonsForDate(td);
  const tomorrow = M.lessonsForDate(addDays(td, 1)).filter(o => !o.cancelled);
  const open = M.tasks().filter(t => !M.isDone(t));
  const overdue = M.sortTasks(open.filter(M.isOverdue));
  const todayT = M.sortTasks(open.filter(t => t.due === td && !M.isOverdue(t)));
  const soon = M.sortTasks(open.filter(t => t.due > td && t.due <= addDays(td, 3)));
  const doneToday = M.tasks().filter(t => t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()).length;
  const exams = db.all('exam').filter(e => e.date && e.date >= td).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const habits = db.all('habit');
  const events = db.all('event').filter(e => e.date === td).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const focusToday = db.all('focus').filter(f => f.date === td).reduce((s, f) => s + (f.minutes || 0), 0);

  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const sem = M.inSemester(td);

  return html`<div>
    <div class="page-head">
      <div class="grow">
        <h1>${hello}</h1>
        <div class="muted small">${DOW_FULL[weekday(td) - 1]}, ${fmtDate(td, { year: true })}${sem ? ` · ${M.weekParity(td) === 1 ? 'I' : 'II'} неделя (${M.weekNo(td)}-я)` : ''}</div>
      </div>
      <button class="btn primary" onClick=${() => openTask(null)}>+ Задача</button>
    </div>

    <div class="grid two">
      <${NowCard} current=${current} next=${next} />
      <div class="card">
        <div class="row between"><h2>Сводка</h2><a class="small" href="#/stats">Статистика →</a></div>
        <div class="grid three" style="grid-template-columns:repeat(3,1fr);gap:8px">
          <div><div class="stat-num ${overdue.length ? 'danger-text' : ''}">${overdue.length}</div><div class="muted tiny">просрочено</div></div>
          <div><div class="stat-num">${todayT.length}</div><div class="muted tiny">на сегодня</div></div>
          <div><div class="stat-num ok-text">${doneToday}</div><div class="muted tiny">сделано сегодня</div></div>
        </div>
        ${focusToday > 0 && html`<div class="small muted" style="margin-top:8px">⏱ Фокус сегодня: ${fmtDur(focusToday)}</div>`}
        ${exams.length > 0 && html`<div style="margin-top:10px">${exams.map(e => html`<div class="row small" key=${e.id} style="margin-top:4px">
          <span class="chip danger">${diffDays(td, e.date)} дн.</span><span>${e.type}: ${M.subjShort(e.subjectId)}</span></div>`)}</div>`}
      </div>
    </div>

    <div class="card" style="margin-top:14px"><${QuickAdd} /></div>

    <div class="grid two" style="margin-top:14px;align-items:start">
      <div>
        <div class="card">
          <div class="row between"><h2>Пары сегодня</h2><a class="small" href="#/schedule">Неделя →</a></div>
          ${lessons.length ? lessons.map(o => html`<${LessonItem} key=${o.key} o=${o} onOpen=${openLesson} state=${lessonState(o)} />`)
            : html`<${Empty}>${sem ? 'Сегодня пар нет 🙌' : 'Семестр не идёт'}<//>`}
          ${events.length > 0 && html`<div class="section-title">События</div>${events.map(e => html`<div class="list-row" key=${e.id} style="cursor:pointer" onClick=${() => go('calendar?d=' + td)}>
            <span class="chip">${e.time || 'весь день'}</span><span>${e.title}</span></div>`)}`}
          ${tomorrow.length > 0 && html`<div class="section-title">Завтра</div>
            <div class="small muted">${tomorrow.map(o => `${o.start} ${M.subjShort(o.subjectId)} (${o.type}${o.room ? ', ' + o.room : ''})`).join(' · ')}</div>`}
        </div>
        ${habits.length > 0 && html`<div class="card">
          <div class="row between"><h2>Привычки</h2><a class="small" href="#/habits">Все →</a></div>
          <div class="row">${habits.map(h => {
            const on = !!(h.log || {})[td];
            return html`<button key=${h.id} class=${'chip' + (on ? ' on' : '')} style="padding:6px 12px;font-size:13px"
              onClick=${() => db.patch(h.id, { log: { ...(h.log || {}), [td]: !on || undefined } })}>${h.emoji || '•'} ${h.title}</button>`;
          })}</div>
        </div>`}
      </div>
      <div class="card">
        <div class="row between"><h2>Задачи</h2><a class="small" href="#/tasks">Все →</a></div>
        ${overdue.length > 0 && html`<div class="section-title danger-text" style="margin-top:4px">Просрочено</div>${overdue.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} />`)}`}
        <div class="section-title" style="margin-top:${overdue.length ? 18 : 4}px">Сегодня</div>
        ${todayT.length ? todayT.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} />`) : html`<div class="muted small">На сегодня ничего</div>`}
        <div class="section-title">Ближайшие 3 дня</div>
        ${soon.length ? soon.map(t => html`<${TaskItem} key=${t.id} t=${t} onOpen=${openTask} />`) : html`<div class="muted small">Пусто</div>`}
      </div>
    </div>
  </div>`;
}

function NowCard({ current, next }) {
  if (current) {
    const s = new Date(`${current.date}T${current.start}:00`), e = new Date(`${current.date}T${current.end}:00`);
    const p = Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100));
    const left = Math.max(0, Math.round((e - Date.now()) / 6e4));
    return html`<div class="card now-card" style="cursor:pointer" onClick=${() => openLesson(current)}>
      <div class="muted small">Сейчас идёт · ${current.type}</div>
      <div style="font-size:19px;font-weight:700;margin:4px 0">${current.title}</div>
      <div class="muted small">📍 ${current.room || '—'} · до ${current.end}</div>
      <div class="big-count" style="margin-top:8px">${left} мин</div><div class="muted tiny" style="margin-bottom:8px">до конца пары</div>
      <div class="progress"><div style=${{ width: p + '%' }}></div></div>
      ${next && next.date === current.date && html`<div class="small" style="margin-top:10px">Дальше: ${next.start} ${M.subjShort(next.subjectId)}, ауд. ${next.room}</div>`}
    </div>`;
  }
  if (next) {
    return html`<div class="card now-card" style="cursor:pointer" onClick=${() => openLesson(next)}>
      <div class="muted small">Следующая пара · ${next.date === today() ? 'сегодня' : fmtDate(next.date, { weekday: true })}</div>
      <div style="font-size:19px;font-weight:700;margin:4px 0">${next.title}</div>
      <div class="muted small">${next.type} · 📍 ${next.room || '—'} · ${next.start}–${next.end}</div>
      <div class="big-count" style="margin-top:10px">${untilText(next.date, next.start)}</div>
      ${next.note && html`<div class="small" style="margin-top:8px">📝 ${next.note}</div>`}
    </div>`;
  }
  return html`<div class="card now-card"><div class="muted small">Пары</div><div style="font-size:19px;font-weight:700">Ближайших пар нет</div></div>`;
}

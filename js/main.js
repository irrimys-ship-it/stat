import { html, render, useEffect, useState } from './html.js';
import * as db from './store.js';
import { SEED, SEED_REMOVED } from './seed.js';
import { Overlays, parseHash } from './ui.js';
import { startNotifier } from './notify.js';
import { TodayView } from './views/today.js';
import { ScheduleView } from './views/schedule.js';
import { TasksView, openTask } from './views/tasks.js';
import { CalendarView } from './views/calendar.js';
import { SubjectsView } from './views/subjects.js';
import { SessionView } from './views/session.js';
import { BudgetView, FocusView, HabitsView, SearchView, StatsView } from './views/extras.js';
import { SettingsView, statusText } from './views/settings.js';

const ROUTES = {
  today: ['Сегодня', '🏠', TodayView],
  schedule: ['Расписание', '🗓', ScheduleView],
  tasks: ['Задачи', '✅', TasksView],
  calendar: ['Календарь', '📅', CalendarView],
  subjects: ['Предметы', '📚', SubjectsView],
  session: ['Сессия', '🎓', SessionView],
  focus: ['Фокус', '⏱', FocusView],
  habits: ['Привычки', '🔥', HabitsView],
  budget: ['Бюджет', '💸', BudgetView],
  stats: ['Статистика', '📈', StatsView],
  search: ['Поиск', '🔍', SearchView],
  settings: ['Настройки', '⚙️', SettingsView],
};
const MAIN = ['today', 'schedule', 'tasks', 'calendar', 'subjects'];
const MORE = ['session', 'focus', 'habits', 'budget', 'stats', 'search', 'settings'];

function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => { const f = () => { setR(parseHash()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}

function SyncBadge() {
  const s = db.sync;
  if (!s.enabled) return html`<a class="sync-badge" href="#/settings"><span class="dot"></span>Локальный режим</a>`;
  const cls = s.status === 'ok' ? 'ok' : s.status === 'error' ? 'err' : s.status === 'syncing' ? 'busy' : '';
  return html`<a class="sync-badge" href="#/settings" title=${statusText()}><span class=${'dot ' + cls}></span>${s.user ? statusText() : 'Войти для синхронизации'}</a>`;
}

function App() {
  db.useStore();
  const route = useRoute();
  const [more, setMore] = useState(false);
  const key = ROUTES[route.parts[0]] ? route.parts[0] : 'today';
  const [, , View] = ROUTES[key];
  useEffect(() => { document.title = ROUTES[key][0] + ' · Учёба'; setMore(false); }, [key]);
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'т') { e.preventDefault(); openTask(null); }
      if (e.key === '/' ) { e.preventDefault(); location.hash = '#/search'; }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, []);

  return html`<div class="layout">
    <nav class="sidebar">
      <div class="brand"><img src="icon.svg" alt="" />Учёба</div>
      ${MAIN.map(k => html`<a key=${k} class=${'nav-link' + (k === key ? ' active' : '')} href=${'#/' + k}><span class="ico">${ROUTES[k][1]}</span>${ROUTES[k][0]}</a>`)}
      <div class="nav-sep"></div>
      ${MORE.map(k => html`<a key=${k} class=${'nav-link' + (k === key ? ' active' : '')} href=${'#/' + k}><span class="ico">${ROUTES[k][1]}</span>${ROUTES[k][0]}</a>`)}
      <${SyncBadge} />
    </nav>
    <main class="main"><${View} parts=${route.parts} query=${route.query} key=${key + (route.parts[1] || '')} /></main>
    <nav class="bottom-nav">
      ${MAIN.slice(0, 4).map(k => html`<a key=${k} class=${k === key ? 'active' : ''} href=${'#/' + k}><span class="ico">${ROUTES[k][1]}</span>${ROUTES[k][0]}</a>`)}
      <button class=${MORE.includes(key) || key === 'subjects' ? 'active' : ''} onClick=${() => setMore(true)}><span class="ico">☰</span>Ещё</button>
    </nav>
    ${more && html`<div class="overlay" onMouseDown=${e => e.target === e.currentTarget && setMore(false)}>
      <div class="modal"><div class="sheet-links">
        ${['subjects', ...MORE].map(k => html`<a key=${k} href=${'#/' + k} onClick=${() => setMore(false)}><span class="ico">${ROUTES[k][1]}</span>${ROUTES[k][0]}</a>`)}
      </div><div class="row" style="margin-top:12px;justify-content:center"><${SyncBadge} /></div></div></div>`}
    <${Overlays} />
  </div>`;
}

async function boot() {
  await db.initSync();
  db.seedMissing(SEED, SEED_REMOVED);
  render(html`<${App} />`, document.getElementById('app'));
  startNotifier();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
}
boot();

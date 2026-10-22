import { html, useState } from '../html.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { Field, Seg, toast } from '../ui.js';
import { DEFAULT_PAIRS } from '../seed.js';
import { enableNotifications } from '../notify.js';

export function SettingsView() {
  db.useStore();
  const st = M.settings();
  return html`<div>
    <div class="page-head"><h1>Настройки</h1></div>
    <div class="grid two" style="align-items:start">
      <div>
        <${Account} />
        <${Appearance} st=${st} />
        <${Semester} st=${st} />
        <${Notifications} st=${st} />
      </div>
      <div>
        <${Roots} st=${st} />
        <${Categories} st=${st} />
        <${Pairs} st=${st} />
        <${Backup} />
      </div>
    </div>
  </div>`;
}

function Account() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const s = db.sync;
  if (!s.enabled) return html`<div class="card"><h2>Синхронизация</h2>
    <div class="small">Сейчас приложение работает <b>локально</b>: данные хранятся только в этом браузере.
    Чтобы синхронизировать устройства, подключи Supabase (инструкция в файле README.md, раздел «Подключение синхронизации»).</div></div>`;
  if (s.user) return html`<div class="card"><h2>Аккаунт</h2>
    <div class="small">Вход выполнен: <b>${s.user.email}</b></div>
    <div class="small muted" style="margin:6px 0 10px">Статус: ${statusText()}${db.pendingCount() ? ` · не отправлено: ${db.pendingCount()}` : ''}</div>
    <div class="row"><button class="btn" onClick=${() => db.runSync()}>Синхронизировать</button><button class="btn danger" onClick=${() => db.signOut()}>Выйти</button></div></div>`;
  const run = fn => async e => {
    e.preventDefault(); setBusy(true);
    try { await fn(); } catch (err) { toast(err.message === 'Invalid login credentials' ? 'Неверная почта или пароль' : err.message); }
    setBusy(false);
  };
  return html`<form class="card stack" onSubmit=${run(() => db.signIn(email, pass))}>
    <h2>Вход для синхронизации</h2>
    <${Field} label="Почта"><input class="input" type="email" autocomplete="email" value=${email} onInput=${e => setEmail(e.target.value)} /><//>
    <${Field} label="Пароль"><input class="input" type="password" autocomplete="current-password" value=${pass} onInput=${e => setPass(e.target.value)} /><//>
    <div class="row">
      <button class="btn primary" disabled=${busy}>Войти</button>
      <button type="button" class="btn" disabled=${busy} onClick=${run(async () => {
        if (pass.length < 6) throw new Error('Пароль минимум 6 символов');
        const r = await db.signUp(email, pass);
        toast(r.session ? 'Аккаунт создан' : 'Проверь почту и подтверди регистрацию');
      })}>Создать аккаунт</button>
    </div>
    <div class="tiny muted">Данные, созданные до входа, отправятся в аккаунт автоматически.</div>
  </form>`;
}

export function statusText() {
  const s = db.sync;
  return { local: 'локально', signedout: 'не выполнен вход', syncing: 'синхронизация…', ok: 'синхронизировано', offline: 'нет сети — изменения сохранятся и отправятся позже', error: 'ошибка: ' + (s.error || '') }[s.status] || s.status;
}

function Appearance({ st }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ui.theme') || 'auto');
  const apply = v => {
    setTheme(v); localStorage.setItem('ui.theme', v);
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  };
  return html`<div class="card stack"><h2>Внешний вид</h2>
    <div class="row"><span class="small grow">Тема (для этого устройства)</span><${Seg} value=${theme} onChange=${apply} options=${[['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']]} /></div>
  </div>`;
}

function Semester({ st }) {
  return html`<div class="card stack"><h2>Семестр</h2>
    <div class="fields">
      <${Field} label="Начало"><input class="input" type="date" value=${st.semesterStart} onChange=${e => M.saveSettings({ semesterStart: e.target.value })} /><//>
      <${Field} label="Конец"><input class="input" type="date" value=${st.semesterEnd} onChange=${e => M.saveSettings({ semesterEnd: e.target.value })} /><//>
      <${Field} label="Группа"><input class="input" value=${st.group} onChange=${e => M.saveSettings({ group: e.target.value })} /><//>
    </div>
    <div class="row"><span class="small grow">Предупреждать о пропусках после</span>
      <input class="input" type="number" min="1" style="width:80px" value=${st.absenceLimit} onChange=${e => M.saveSettings({ absenceLimit: Number(e.target.value) || 3 })} /></div>
    <div class="tiny muted">Неделя, в которую попадает начало семестра, считается I (нечётной). Если у вас наоборот — сдвинь дату начала на неделю.</div>
  </div>`;
}

function Notifications({ st }) {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const [on, setOn] = useState(localStorage.getItem('notify.on') === '1' && perm === 'granted');
  return html`<div class="card stack"><h2>Напоминания</h2>
    <div class="small muted">Работают, пока приложение открыто (вкладка или установленное приложение). Напоминания при закрытом приложении появятся вместе с Telegram-ботом.</div>
    ${perm === 'unsupported' ? html`<div class="small">Этот браузер не поддерживает уведомления.</div>`
      : html`<div class="row"><span class="small grow">Уведомления на этом устройстве</span>
        ${on ? html`<button class="btn" onClick=${() => { localStorage.setItem('notify.on', '0'); setOn(false); toast('Выключено'); }}>Выключить</button>`
          : html`<button class="btn primary" onClick=${async () => { if (await enableNotifications()) { setOn(true); toast('Уведомления включены'); } else toast('Браузер не разрешил уведомления'); }}>Включить</button>`}</div>`}
    <div class="fields">
      <${Field} label="О паре за (мин)"><input class="input" type="number" min="0" value=${st.notify.lessonMin} onChange=${e => M.saveSettings({ notify: { ...st.notify, lessonMin: Number(e.target.value) || 0 } })} /><//>
      <${Field} label="О дедлайне за (ч)"><input class="input" type="number" min="0" value=${st.notify.deadlineHours} onChange=${e => M.saveSettings({ notify: { ...st.notify, deadlineHours: Number(e.target.value) || 0 } })} /><//>
    </div>
  </div>`;
}

function Roots({ st }) {
  const [local, setLocal] = useState(M.deviceRoots());
  const [name, setName] = useState('');
  const saveLocal = (id, v) => { const r = { ...local, [id]: v.trim().replace(/^"(.*)"$/, '$1') }; setLocal(r); M.setDeviceRoots(r); };
  return html`<div class="card stack"><h2>Папки на этом устройстве</h2>
    <div class="small muted">Задай, где на <b>этом</b> компьютере лежат общие папки. Тогда ссылка «Учёба / Курсовые\\СПТУ» откроется и на ПК, и на ноуте, даже если пути разные.</div>
    ${st.roots.map(r => html`<div class="row" key=${r.id} style="flex-wrap:nowrap">
      <span style="width:90px" class="small bold">${r.name}</span>
      <input class="input" placeholder="D:\\Учёба" value=${local[r.id] || ''} onChange=${e => saveLocal(r.id, e.target.value)} />
      <button class="btn sm ghost" title="Удалить корень" onClick=${() => confirm(`Удалить корень «${r.name}»?`) && M.saveSettings({ roots: st.roots.filter(x => x.id !== r.id) })}>✕</button>
    </div>`)}
    <div class="row" style="flex-wrap:nowrap"><input class="input" placeholder="Новая папка-корень (например, «Загрузки»)" value=${name} onInput=${e => setName(e.target.value)} />
      <button class="btn" onClick=${() => { if (name.trim()) { M.saveSettings({ roots: [...st.roots, { id: db.uid().slice(0, 8), name: name.trim() }] }); setName(''); } }}>+</button></div>
    <div class="section-title" style="margin-bottom:0">Открытие папок в проводнике</div>
    <div class="small">Браузер не может сам открыть папку на диске. Для этого один раз на каждом компьютере запусти
      <code>tools\\openpath\\install.cmd</code> из папки проекта (двойной клик). Он регистрирует ссылки <code>openpath:</code> только для текущего пользователя и только открывает папку или выделяет файл в проводнике, ничего не запуская.</div>
    <div class="small">Ссылки «💻 VS Code» работают без установки, если установлен VS Code.</div>
  </div>`;
}

function Categories({ st }) {
  const [name, setName] = useState('');
  const COLORS = ['#14a37f', '#e8900c', '#e5484d', '#8e6cef', '#0ea5e9', '#d946ef', '#64748b'];
  const list = st.taskCategories;
  return html`<div class="card stack"><h2>Категории задач</h2>
    <div class="small muted">«Учёба» встроена и привязана к предметам. Здесь — свои категории для личных задач.</div>
    ${list.map(c => html`<div class="row" key=${c.id} style="flex-wrap:nowrap">
      <input type="color" value=${c.color} style="width:34px;height:30px;border:0;background:none" onChange=${e => M.saveSettings({ taskCategories: list.map(x => x.id === c.id ? { ...x, color: e.target.value } : x) })} />
      <input class="input" value=${c.name} onChange=${e => M.saveSettings({ taskCategories: list.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
      <button class="btn sm ghost" onClick=${() => confirm(`Удалить категорию «${c.name}»?`) && M.saveSettings({ taskCategories: list.filter(x => x.id !== c.id) })}>✕</button></div>`)}
    <div class="row" style="flex-wrap:nowrap"><input class="input" placeholder="Новая категория" value=${name} onInput=${e => setName(e.target.value)} />
      <button class="btn" onClick=${() => { if (name.trim()) { M.saveSettings({ taskCategories: [...list, { id: db.uid().slice(0, 8), name: name.trim(), color: COLORS[list.length % COLORS.length] }] }); setName(''); } }}>+</button></div>
  </div>`;
}

function Pairs({ st }) {
  const set = (i, j, v) => M.saveSettings({ pairs: st.pairs.map((p, k) => k === i ? (j ? [p[0], v] : [v, p[1]]) : p) });
  return html`<div class="card stack"><h2>Время пар</h2>
    ${st.pairs.map((p, i) => html`<div class="row" key=${i} style="flex-wrap:nowrap"><span style="width:60px" class="small">${i + 1} пара</span>
      <input class="input" type="time" value=${p[0]} onChange=${e => set(i, 0, e.target.value)} />
      <input class="input" type="time" value=${p[1]} onChange=${e => set(i, 1, e.target.value)} /></div>`)}
    <div class="row"><button class="btn sm" onClick=${() => M.saveSettings({ pairs: [...st.pairs, ['21:30', '22:50']] })}>+ пара</button>
      <button class="btn sm ghost" onClick=${() => confirm('Сбросить время пар?') && M.saveSettings({ pairs: DEFAULT_PAIRS })}>Сбросить</button></div>
    <div class="tiny muted">7 и 8 пары взяты из твоего расписания; остальные — типовые, поправь при необходимости.</div>
  </div>`;
}

function Backup() {
  const exp = () => {
    const blob = new Blob([JSON.stringify(db.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ucheba-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const imp = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    f.text().then(t => { const n = db.importAll(JSON.parse(t)); toast(`Импортировано записей: ${n}`); }).catch(err => toast('Ошибка: ' + err.message));
  };
  return html`<div class="card stack"><h2>Резервная копия</h2>
    <div class="small muted">Выгрузка всех данных в файл JSON (файлы-вложения не входят, только ссылки на них).</div>
    <div class="row"><button class="btn" onClick=${exp}>⬇ Экспорт</button>
      <label class="btn">⬆ Импорт<input type="file" accept="application/json,.json" hidden onChange=${imp} /></label></div>
  </div>`;
}

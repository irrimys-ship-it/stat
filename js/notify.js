// Напоминания о парах и дедлайнах, пока приложение открыто.

import * as M from './model.js';
import { addDays, today } from './date.js';

const SENT_KEY = 'notify.sent';

export async function enableNotifications() {
  if (!('Notification' in window)) return false;
  const p = await Notification.requestPermission();
  if (p !== 'granted') return false;
  localStorage.setItem('notify.on', '1');
  show('Уведомления включены', 'Напомню о парах и дедлайнах, пока приложение открыто');
  return true;
}

async function show(title, body, tag) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, tag, icon: 'icon.svg', badge: 'icon.svg' });
    else new Notification(title, { body, tag, icon: 'icon.svg' });
  } catch (e) { console.warn(e); }
}

function check() {
  if (localStorage.getItem('notify.on') !== '1' || !('Notification' in window) || Notification.permission !== 'granted') return;
  let sent; try { sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); } catch { sent = {}; }
  const now = Date.now();
  const st = M.settings();
  const fire = (key, title, body) => { if (sent[key]) return; sent[key] = now; show(title, body, key); };

  if (st.notify.lessonMin > 0) {
    for (const d of [today(), addDays(today(), 1)]) for (const o of M.lessonsForDate(d, { includeCancelled: false })) {
      const start = new Date(`${o.date}T${o.start}:00`).getTime();
      const diff = start - now;
      if (diff > 0 && diff <= st.notify.lessonMin * 6e4)
        fire('l:' + o.key, `Через ${Math.round(diff / 6e4)} мин: ${M.subjShort(o.subjectId) || o.title}`, `${o.type}, ауд. ${o.room || '—'}${o.note ? ' · ' + o.note : ''}`);
    }
  }
  if (st.notify.deadlineHours > 0) {
    for (const t of M.tasks()) {
      if (M.isDone(t) || !t.due) continue;
      const due = M.taskDue(t), diff = due - now;
      if (diff > 0 && diff <= st.notify.deadlineHours * 36e5) fire('d:' + t.id + ':' + t.due, 'Скоро дедлайн', `${t.title} — ${t.due === today() ? 'сегодня' : 'завтра'}${t.dueTime ? ' в ' + t.dueTime : ''}`);
      if (diff <= 0 && diff > -36e5) fire('o:' + t.id + ':' + t.due, 'Дедлайн наступил', t.title);
    }
  }
  // Чистим старые отметки
  for (const k of Object.keys(sent)) if (now - sent[k] > 7 * 864e5) delete sent[k];
  localStorage.setItem(SENT_KEY, JSON.stringify(sent));
}

export function startNotifier() {
  setTimeout(check, 3000);
  setInterval(check, 30_000);
}

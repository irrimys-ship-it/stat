// Работа с датами. Даты храним строками: 'YYYY-MM-DD', время — 'HH:MM'.

export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const addMonths = (s, n) => { const d = parseISO(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
// 1 = пн … 7 = вс
export const weekday = s => { const w = parseISO(s).getDay(); return w === 0 ? 7 : w; };
export const mondayOf = s => addDays(s, 1 - weekday(s));
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const toMin = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

export const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function fmtDate(s, { weekday: wd = false, year = false } = {}) {
  if (!s) return '';
  const d = parseISO(s);
  let r = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (year || d.getFullYear() !== new Date().getFullYear()) r += ` ${d.getFullYear()}`;
  if (wd) r = `${DOW[weekday(s) - 1]}, ${r}`;
  return r;
}

// «сегодня», «завтра», «через 3 дн.», «2 дн. назад»
export function relDay(s) {
  const n = diffDays(today(), s);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === 2) return 'послезавтра';
  if (n === -1) return 'вчера';
  if (n > 0 && n < 7) return DOW_FULL[weekday(s) - 1].toLowerCase();
  if (n > 0) return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  return `${-n} ${plural(-n, 'день', 'дня', 'дней')} назад`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Длительность в минутах → «1 ч 20 мин»
export function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// Сколько осталось до момента (date + time)
export function untilText(date, time) {
  const target = new Date(`${date}T${time || '23:59'}:00`);
  let ms = target - new Date();
  const past = ms < 0; ms = Math.abs(ms);
  const min = Math.floor(ms / 6e4), h = Math.floor(min / 60), d = Math.floor(h / 24);
  let t;
  if (d >= 1) t = `${d} ${plural(d, 'день', 'дня', 'дней')}${h % 24 ? ` ${h % 24} ч` : ''}`;
  else if (h >= 1) t = `${h} ч ${min % 60} мин`;
  else t = `${min} мин`;
  return past ? `${t} назад` : `через ${t}`;
}

export const dueMs = (date, time) => new Date(`${date}T${time || '23:59'}:00`).getTime();

// Локальное хранилище + синхронизация с Supabase.
//
// Все данные — это «записи» { id, kind, data, deleted, ts }.
// ts — время изменения на устройстве (мс); при конфликте побеждает запись с бо́льшим ts.
// Изменения сразу сохраняются в localStorage и ставятся в очередь на отправку,
// поэтому всё работает без сети и досинхронизируется, когда сеть появится.

import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from './config.js';

const LS_ITEMS = 'st.items.v1';
const LS_QUEUE = 'st.queue.v1';
const LS_CURSOR = 'st.cursor.v1';
const LS_OWNER = 'st.owner.v1';

const items = new Map();
let queue = new Set();
const listeners = new Set();
let version = 0;
const cache = new Map();

export const sync = { enabled: false, user: null, status: 'local', error: null, lastSync: null };
let sb = null;
let channel = null;
let syncing = null;
let resync = false;

// ---------- Локальная часть ----------

function load() {
  try {
    for (const it of JSON.parse(localStorage.getItem(LS_ITEMS) || '[]')) items.set(it.id, it);
    queue = new Set(JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'));
  } catch (e) { console.error('Не удалось прочитать локальные данные', e); }
}

let saveTimer = null;
function persistNow() {
  clearTimeout(saveTimer); saveTimer = null;
  try {
    localStorage.setItem(LS_ITEMS, JSON.stringify([...items.values()]));
    localStorage.setItem(LS_QUEUE, JSON.stringify([...queue]));
  } catch (e) { console.error('Не удалось сохранить данные', e); }
}
function persist() { if (!saveTimer) saveTimer = setTimeout(persistNow, 120); }
addEventListener('pagehide', () => saveTimer && persistNow());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && persistNow());

function emit() {
  version++; cache.clear();
  for (const fn of listeners) fn(version);
}

export function useStore() {
  const [, set] = useState(version);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
  return version;
}
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

const view = it => ({ id: it.id, ...it.data });

export function all(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const r = [];
  for (const it of items.values()) if (it.kind === kind && !it.deleted) r.push(view(it));
  cache.set(kind, r);
  return r;
}
export function get(id) { const it = items.get(id); return it && !it.deleted ? view(it) : null; }
export const has = id => items.has(id);

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

function write(id, kind, data, deleted = false, ts = Date.now()) {
  const prev = items.get(id);
  // ts должен расти даже если часы на устройстве одинаковые
  if (prev && ts <= prev.ts) ts = prev.ts + 1;
  items.set(id, { id, kind, data, deleted, ts });
  queue.add(id);
  persist(); emit(); schedulePush();
  return id;
}

export function put(kind, data, id = uid()) {
  const { id: _drop, ...clean } = data;
  return write(id, kind, clean);
}
export function patch(id, partial) {
  const it = items.get(id); if (!it) return;
  const { id: _drop, ...clean } = partial;
  write(id, it.kind, { ...it.data, ...clean }, it.deleted);
}
export function remove(id) {
  const it = items.get(id); if (!it) return;
  write(id, it.kind, it.data, true);
}
export function restore(id) {
  const it = items.get(id); if (!it) return;
  write(id, it.kind, it.data, false);
}

// Начальные данные: кладутся с ts = 1, поэтому любая правка пользователя их перекрывает.
// Неизменённые копии (ts = 1) обновляются до текущей версии набора, убранные — помечаются удалёнными.
export function seedMissing(records, removed = []) {
  let changed = 0;
  const same = (it, data, deleted) => it.deleted === deleted && JSON.stringify(it.data) === JSON.stringify(data);
  for (const r of records) {
    const { id, kind, ...data } = r;
    const cur = items.get(id);
    if (cur && (cur.ts !== 1 || same(cur, data, false))) continue;
    items.set(id, { id, kind, data, deleted: false, ts: 1 });
    queue.add(id); changed++;
  }
  for (const id of removed) {
    const cur = items.get(id);
    if (!cur || cur.ts !== 1 || cur.deleted) continue;
    items.set(id, { ...cur, deleted: true });
    queue.add(id); changed++;
  }
  if (changed) { persist(); emit(); schedulePush(); }
}

// Экспорт / импорт
export function exportAll() {
  return { app: 'ucheba', version: 1, exportedAt: new Date().toISOString(), items: [...items.values()] };
}
export function importAll(dump) {
  if (!dump || !Array.isArray(dump.items)) throw new Error('Неверный файл');
  let n = 0;
  for (const it of dump.items) {
    if (!it.id || !it.kind) continue;
    const cur = items.get(it.id);
    if (!cur || it.ts > cur.ts) { items.set(it.id, { ...it, ts: Math.max(it.ts, Date.now()) }); queue.add(it.id); n++; }
  }
  persist(); emit(); schedulePush();
  return n;
}
export function wipeLocal() {
  items.clear(); queue.clear();
  localStorage.removeItem(LS_ITEMS); localStorage.removeItem(LS_QUEUE);
  for (const k of Object.keys(localStorage)) if (k.startsWith(LS_CURSOR)) localStorage.removeItem(k);
  emit();
}
export const pendingCount = () => queue.size;

// ---------- Синхронизация ----------

function setStatus(status, error = null) {
  sync.status = status; sync.error = error;
  if (status === 'ok') sync.lastSync = new Date();
  emit();
}

export function supabase() { return sb; }

export async function initSync() {
  load();
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || !window.supabase) { emit(); return; }
  sync.enabled = true;
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await sb.auth.getSession();
  onUser(data.session?.user || null);
  sb.auth.onAuthStateChange((_ev, session) => onUser(session?.user || null));

  addEventListener('online', () => runSync());
  addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && runSync());
  setInterval(() => runSync(), 60_000);
}

function onUser(user) {
  const prev = sync.user?.id;
  sync.user = user;
  if (!user) { if (channel) { sb.removeChannel(channel); channel = null; } setStatus('signedout'); return; }
  if (user.id === prev) return;
  // Если в этом браузере раньше был другой аккаунт — не смешиваем данные
  const owner = localStorage.getItem(LS_OWNER);
  if (owner && owner !== user.id) wipeLocal();
  localStorage.setItem(LS_OWNER, user.id);
  subscribeRealtime();
  runSync();
}

function subscribeRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('items-' + sync.user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${sync.user.id}` },
      payload => { if (payload.new?.id) { mergeRemote([payload.new]); } })
    .subscribe();
}

function mergeRemote(rows) {
  let changed = false;
  for (const r of rows) {
    const ts = Number(r.ts);
    const local = items.get(r.id);
    if (!local || ts >= local.ts) {
      if (!local || ts > local.ts || local.deleted !== r.deleted || JSON.stringify(local.data) !== JSON.stringify(r.data)) changed = true;
      items.set(r.id, { id: r.id, kind: r.kind, data: r.data, deleted: r.deleted, ts });
      queue.delete(r.id);
    } else {
      queue.add(r.id); // у нас версия новее — отправим
    }
  }
  if (changed) { persist(); emit(); } else persist();
}

let pushTimer = null;
function schedulePush() {
  if (!sync.enabled || !sync.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => runSync(), 800);
}

export function runSync() {
  if (!sb || !sync.user) return Promise.resolve();
  if (syncing) { resync = true; return syncing; }
  syncing = (async () => {
    if (!navigator.onLine) { setStatus('offline'); return; }
    setStatus('syncing');
    try {
      await pull();
      await push();
      setStatus('ok');
    } catch (e) {
      console.error('Ошибка синхронизации', e);
      setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
    }
  })().finally(() => {
    syncing = null;
    if (resync) { resync = false; runSync(); }
  });
  return syncing;
}

async function pull() {
  const key = LS_CURSOR + '.' + sync.user.id;
  const cursor = localStorage.getItem(key) || '1970-01-01T00:00:00Z';
  let max = cursor, offset = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await sb.from('items')
      .select('id,kind,data,deleted,ts,updated_at')
      .gt('updated_at', cursor).order('updated_at').range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (data.length) mergeRemote(data);
    for (const r of data) if (r.updated_at > max) max = r.updated_at;
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  // Небольшой запас назад: транзакции на сервере могут завершиться не по порядку
  if (max !== cursor) localStorage.setItem(key, new Date(new Date(max).getTime() - 30_000).toISOString());
}

async function push() {
  const ids = [...queue];
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300).map(id => items.get(id)).filter(Boolean);
    if (!chunk.length) continue;
    const rows = chunk.map(it => ({ id: it.id, user_id: sync.user.id, kind: it.kind, data: it.data, deleted: it.deleted, ts: it.ts }));
    const { error } = await sb.from('items').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
    for (const it of chunk) if (items.get(it.id)?.ts === it.ts) queue.delete(it.id);
  }
  persist();
}

// ---------- Аккаунт ----------

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  return data;
}
export async function signOut() {
  await runSync();
  await sb.auth.signOut();
}

// ---------- Файлы ----------

export async function uploadFile(file) {
  if (!sb || !sync.user) throw new Error('Файлы доступны после входа в аккаунт');
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80);
  const path = `${sync.user.id}/${uid()}-${safe}`;
  const { error } = await sb.storage.from(CONFIG.filesBucket).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name, size: file.size, mime: file.type };
}
export async function fileUrl(path, download = false) {
  const { data, error } = await sb.storage.from(CONFIG.filesBucket).createSignedUrl(path, 3600, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
export async function deleteFile(path) {
  if (!sb || !sync.user) return;
  await sb.storage.from(CONFIG.filesBucket).remove([path]);
}

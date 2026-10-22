// Настройки подключения к Supabase.
// Пока поля пустые, приложение работает локально (данные только в этом браузере).
// URL и anon/publishable key берутся в Supabase: Project Settings → API.
// Это публичный ключ, его можно хранить в репозитории: данные защищены правилами RLS.
// service_role / secret key сюда НЕ вставлять.
export const CONFIG = {
  supabaseUrl: 'https://lwyuksouxbursiupobez.supabase.co',
  supabaseKey: 'sb_publishable_dmkKZu-ADXJT7ZPZ_9r6Gg_O06kBT2j',
  filesBucket: 'files',
};

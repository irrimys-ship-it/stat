-- Схема базы для приложения «Учёба».
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить всё → Run.

create table if not exists public.items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  kind       text        not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  ts         bigint      not null default 0,          -- время правки на устройстве (для разрешения конфликтов)
  updated_at timestamptz not null default now(),      -- время записи на сервере (для подтягивания изменений)
  primary key (user_id, id)
);

create index if not exists items_user_updated on public.items (user_id, updated_at);

-- Сервер сам ставит updated_at и не даёт старой версии перезаписать более новую
create or replace function public.items_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.ts < old.ts then
    return null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

-- Доступ только к своим данным
alter table public.items enable row level security;

drop policy if exists "own items select" on public.items;
drop policy if exists "own items insert" on public.items;
drop policy if exists "own items update" on public.items;
drop policy if exists "own items delete" on public.items;
create policy "own items select" on public.items for select to authenticated using (user_id = auth.uid());
create policy "own items insert" on public.items for insert to authenticated with check (user_id = auth.uid());
create policy "own items update" on public.items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items delete" on public.items for delete to authenticated using (user_id = auth.uid());

-- Мгновенная синхронизация между открытыми устройствами
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

-- Хранилище файлов: приватная корзина, каждый видит только папку со своим id
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own files select" on storage.objects;
drop policy if exists "own files insert" on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
create policy "own files select" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

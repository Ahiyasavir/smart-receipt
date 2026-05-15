-- Initial schema: receipts + budgets tables with RLS

create table if not exists receipts (
  id          text        primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  date        timestamptz not null,
  store_name  text        not null,
  raw_text    text        not null default '',
  items       jsonb       not null default '[]',
  total       numeric     not null default 0,
  notes       text,
  created_at  timestamptz not null default now()
);

alter table receipts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='receipts' and policyname='Users see own receipts') then
    create policy "Users see own receipts" on receipts for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='receipts' and policyname='Users insert own receipts') then
    create policy "Users insert own receipts" on receipts for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='receipts' and policyname='Users update own receipts') then
    create policy "Users update own receipts" on receipts for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='receipts' and policyname='Users delete own receipts') then
    create policy "Users delete own receipts" on receipts for delete using (auth.uid() = user_id);
  end if;
end $$;

create table if not exists budgets (
  user_id uuid    primary key references auth.users(id) on delete cascade,
  weekly  jsonb   not null default '{}',
  monthly jsonb   not null default '{}'
);

alter table budgets enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='budgets' and policyname='Users see own budgets') then
    create policy "Users see own budgets" on budgets for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='budgets' and policyname='Users upsert own budgets') then
    create policy "Users upsert own budgets" on budgets for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='budgets' and policyname='Users update own budgets') then
    create policy "Users update own budgets" on budgets for update using (auth.uid() = user_id);
  end if;
end $$;

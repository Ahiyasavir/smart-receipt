-- Run this once in the Supabase SQL editor to set up tables + RLS.

-- ── Receipts ─────────────────────────────────────────────────────────────────
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

create policy "Users see own receipts"
  on receipts for select using (auth.uid() = user_id);

create policy "Users insert own receipts"
  on receipts for insert with check (auth.uid() = user_id);

create policy "Users update own receipts"
  on receipts for update using (auth.uid() = user_id);

create policy "Users delete own receipts"
  on receipts for delete using (auth.uid() = user_id);

-- ── Budgets ──────────────────────────────────────────────────────────────────
create table if not exists budgets (
  user_id uuid    primary key references auth.users(id) on delete cascade,
  weekly  jsonb   not null default '{}',
  monthly jsonb   not null default '{}'
);

alter table budgets enable row level security;

create policy "Users see own budgets"
  on budgets for select using (auth.uid() = user_id);

create policy "Users upsert own budgets"
  on budgets for insert with check (auth.uid() = user_id);

create policy "Users update own budgets"
  on budgets for update using (auth.uid() = user_id);

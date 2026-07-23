create table if not exists public.trip_expenses (
  id uuid primary key,
  payer text not null check (payer in ('rajesh', 'kavya', 'dhanu', 'shiva', 'anusha')),
  amount numeric(12, 2) not null check (amount > 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  date date not null,
  category text not null,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.trip_expenses
add column if not exists total_amount numeric(12, 2) not null default 0 check (total_amount >= 0);

create extension if not exists pgcrypto;

create table if not exists public.trip_access (
  code_hash text primary key
);

insert into public.trip_access (code_hash)
values ('e7fd80bcdc18f356244eeb32a37ed8499e7b851bd174fc1bb0bb6bc1e513202f')
on conflict do nothing;

create or replace function public.has_trip_access()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.trip_access
    where code_hash = encode(extensions.digest(coalesce(current_setting('request.headers', true)::json ->> 'x-trip-code', ''), 'sha256'), 'hex')
  );
$$;

alter table public.trip_expenses enable row level security;
drop policy if exists "Trip crew can read expenses" on public.trip_expenses;
drop policy if exists "Trip crew can add expenses" on public.trip_expenses;
drop policy if exists "Trip crew can delete expenses" on public.trip_expenses;
create policy "Trip code can read expenses" on public.trip_expenses for select to anon using (public.has_trip_access());
create policy "Trip code can add expenses" on public.trip_expenses for insert to anon with check (public.has_trip_access());
create policy "Trip code can delete expenses" on public.trip_expenses for delete to anon using (public.has_trip_access());

alter table public.trip_expenses replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.trip_expenses;
exception
  when duplicate_object then null;
end;
$$;

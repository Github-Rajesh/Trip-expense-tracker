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

alter table public.trip_expenses enable row level security;

create policy "Trip crew can read expenses"
on public.trip_expenses for select to anon using (true);

create policy "Trip crew can add expenses"
on public.trip_expenses for insert to anon with check (true);

create policy "Trip crew can delete expenses"
on public.trip_expenses for delete to anon using (true);

alter table public.trip_expenses replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.trip_expenses;
exception
  when duplicate_object then null;
end;
$$;

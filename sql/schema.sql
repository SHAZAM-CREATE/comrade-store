-- ============================================================
-- Comrade Store — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------------------------------------------------
-- One row per auth user, holding the app-facing username & phone number.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by any signed-in user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------- products ------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  price numeric not null check (price > 0),
  condition text not null check (condition in ('new','used')),
  quantity int not null default 1 check (quantity > 0),
  status text not null default 'available' check (status in ('available','sold')),
  contact text not null,
  location_name text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products are viewable by any signed-in user"
  on public.products for select
  to authenticated
  using (true);

create policy "users can insert their own products"
  on public.products for insert
  to authenticated
  with check (auth.uid() = seller_id);

create policy "users can update their own products"
  on public.products for update
  to authenticated
  using (auth.uid() = seller_id);

create policy "users can delete their own products"
  on public.products for delete
  to authenticated
  using (auth.uid() = seller_id);

-- ---------- unlocks -------------------------------------------------------
-- Records which buyer has paid to see which seller's contact.
create table if not exists public.unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.unlocks enable row level security;

create policy "users can view their own unlocks"
  on public.unlocks for select
  to authenticated
  using (auth.uid() = user_id);

-- Unlocks are only ever inserted by the payhero-callback Edge Function
-- (using the service role key), never directly by the client — so there
-- is intentionally no insert policy for the `authenticated` role here.

-- ---------- payments -------------------------------------------------------
-- One row per STK push attempt. Created by the payhero-initiate function,
-- updated by the payhero-callback function when M-Pesa confirms/declines.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  amount numeric not null,
  phone text not null,
  provider text not null default 'payhero',
  status text not null default 'pending' check (status in ('pending','success','failed')),
  provider_reference text,
  checkout_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "users can view their own payments"
  on public.payments for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates to `payments` happen via the Edge Functions with the
-- service role key, which bypasses RLS — so no write policies for
-- `authenticated` are needed (or wanted) here.

-- ---------- realtime --------------------------------------------------------
-- Lets the browser subscribe to status changes on its own payment row
-- and to new/changed listings on the feed.
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.products;

-- ---------- username -> email lookup (for username-based login) -----------
-- SECURITY DEFINER so it can read auth.users, but it only ever returns
-- the single email that matches an existing username — nothing else.
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = p_username
  limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;
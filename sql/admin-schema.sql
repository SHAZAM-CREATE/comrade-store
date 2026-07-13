-- ============================================================
-- Comrade Store — admin panel support
-- Run this in the Supabase SQL editor AFTER sql/schema.sql
-- ============================================================

-- 1. Add the admin flag to profiles
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 2. Helper function: is the currently logged-in user an admin?
-- SECURITY DEFINER so it can be used inside RLS policies without
-- those policies recursively re-checking themselves.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- 3. Make YOURSELF the admin — replace 'YOUR_USERNAME' and run this once.
-- update public.profiles set is_admin = true where username = 'YOUR_USERNAME';

-- 4. RPC the admin dashboard uses to list every user with their email
-- (email lives in auth.users, which the client can never query directly).
-- Silently returns zero rows for anyone who isn't an admin.
create or replace function public.admin_list_users()
returns table (id uuid, username text, phone text, email text, created_at timestamptz, is_admin boolean)
language sql
security definer
set search_path = public, auth
as $$
  select p.id, p.username, p.phone, u.email, p.created_at, p.is_admin
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- 5. Let admins see every payment (regular users already see only their own —
-- Postgres OR's multiple permissive policies together, so both hold at once).
create policy "admins can view all payments"
  on public.payments for select
  to authenticated
  using (public.is_admin());

-- 6. Let admins delete ANY product, not just their own.
create policy "admins can delete any product"
  on public.products for delete
  to authenticated
  using (public.is_admin());
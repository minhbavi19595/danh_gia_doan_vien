-- 02_rpc_admin.sql
-- Run this in Supabase SQL Editor

-- Function to create a user with a specific role
create or replace function public.admin_create_user(
  email text,
  password text,
  department_name text,
  role_name text default 'department'
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_user_id uuid;
  encrypted_pw text;
begin
  -- Check if caller is admin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  -- Insert into auth.users
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, recovery_sent_at, last_sign_in_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', email, encrypted_pw, 
    now(), now(), now(), 
    '{"provider":"email","providers":["email"]}', 
    json_build_object('role', role_name)::jsonb, 
    now(), now(), 
    '', '', '', ''
  );
  
  -- Insert into auth.identities
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), new_user_id, new_user_id::text, format('{"sub":"%s","email":"%s"}', new_user_id::text, email)::jsonb, 'email', now(), now(), now()
  );

  -- If it's a department, insert into public.departments
  if role_name = 'department' then
    insert into public.departments (user_id, name)
    values (new_user_id, department_name);
  end if;

  return new_user_id;
end;
$$;

-- Function to update a user's password
create or replace function public.admin_update_user_password(
  target_user_id uuid,
  new_password text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Check if caller is admin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  where id = target_user_id;
end;
$$;

-- Function to lock/unlock a user account
create or replace function public.admin_toggle_user_ban(
  target_user_id uuid,
  is_banned boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Check if caller is admin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  update auth.users
  set banned_until = case when is_banned then '3000-01-01'::timestamptz else null end,
      updated_at = now()
  where id = target_user_id;
end;
$$;

-- Function to get ban status of users
create or replace function public.admin_get_users_status()
returns table(user_id uuid, banned_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Check if caller is admin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
    select u.id as user_id, u.banned_until
    from auth.users u;
end;
$$;

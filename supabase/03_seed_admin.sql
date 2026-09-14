-- 03_seed_admin.sql
-- Run this to create the initial admin user.
-- It requires the pgcrypto extension from 01_schema.sql.

do $$
declare
  new_user_id uuid := gen_random_uuid();
  admin_email text := '[EMAIL_ADDRESS]';
  admin_password text := 'mk';
begin
  -- Check if admin already exists
  if exists (select 1 from auth.users where email = admin_email) then
    raise notice 'Admin user already exists!';
    return;
  end if;

  -- Insert into auth.users
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, recovery_sent_at, last_sign_in_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', admin_email, crypt(admin_password, gen_salt('bf')), 
    now(), now(), now(), 
    '{"provider":"email","providers":["email"]}', 
    '{"role":"admin"}'::jsonb, 
    now(), now(), 
    '', '', '', ''
  );
  
  -- Insert into auth.identities
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), new_user_id, new_user_id::text, format('{"sub":"%s","email":"%s"}', new_user_id::text, admin_email)::jsonb, 'email', now(), now(), now()
  );

  raise notice 'Created admin user with email % and password %', admin_email, admin_password;
end;
$$;

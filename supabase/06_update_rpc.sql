-- Xoá hàm cũ (nếu có) do thay đổi tham số truyền vào
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text);

-- Cập nhật hàm admin_create_user để hỗ trợ role bi_thu_chi_doan và bi_thu_doan
CREATE OR REPLACE FUNCTION public.admin_create_user(
  email text,
  password text,
  p_department_id uuid,
  role_name text default 'bi_thu_chi_doan'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(password, gen_salt('bf'));

  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, recovery_sent_at, last_sign_in_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', email, encrypted_pw, 
    now(), now(), now(), 
    '{"provider":"email","providers":["email"]}', 
    json_build_object('role', role_name)::jsonb, 
    now(), now(), 
    '', '', '', ''
  );
  
  -- Insert into auth.identities
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text, format('{"sub":"%s","email":"%s"}', new_user_id::text, email)::jsonb, 'email', now(), now(), now()
  );

  -- Only update the department record if they are a bi_thu_chi_doan
  IF (role_name = 'bi_thu_chi_doan' OR role_name = 'department') AND p_department_id IS NOT NULL THEN
    UPDATE public.departments SET user_id = new_user_id WHERE id = p_department_id;
  END IF;

  RETURN new_user_id;
END;
$$;
-- Function to get all users for admin management
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE (
  id uuid,
  email varchar,
  role text,
  department_name text,
  created_at timestamptz,
  banned_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT 
      u.id, 
      u.email::varchar, 
      (u.raw_user_meta_data->>'role')::text as role,
      d.name as department_name,
      u.created_at, 
      u.banned_until
    FROM auth.users u
    LEFT JOIN public.departments d ON u.id = d.user_id
    WHERE (u.raw_user_meta_data->>'role')::text != 'admin' OR (u.raw_user_meta_data->>'role') IS NULL
    ORDER BY u.created_at DESC;
END;
$$;

-- 09_member_transfer_requests.sql
-- Quy trình chuyển chi đoàn có bước xác nhận từ Bí thư chi đoàn bên nhận

CREATE TABLE IF NOT EXISTS public.member_transfer_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
  from_department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  to_department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  created_by uuid REFERENCES auth.users(id),
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  resolved_at timestamptz
);

-- Mỗi đoàn viên chỉ được có tối đa 1 yêu cầu chuyển đang chờ xử lý
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_transfer_per_member
ON public.member_transfer_requests(member_id)
WHERE status = 'pending';

ALTER TABLE public.member_transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can do all on transfer requests" ON public.member_transfer_requests;
CREATE POLICY "Admin can do all on transfer requests"
ON public.member_transfer_requests FOR ALL
USING (public.is_admin());

DROP POLICY IF EXISTS "Bi thu doan can view transfer requests" ON public.member_transfer_requests;
CREATE POLICY "Bi thu doan can view transfer requests"
ON public.member_transfer_requests FOR SELECT
USING (public.is_bi_thu_doan());

DROP POLICY IF EXISTS "Departments can view related transfer requests" ON public.member_transfer_requests;
CREATE POLICY "Departments can view related transfer requests"
ON public.member_transfer_requests FOR SELECT
USING (
  from_department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
  OR to_department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
);

-- 1. RPC gửi yêu cầu chuyển chi đoàn (đoàn viên vẫn ở chi đoàn cũ cho đến khi bên nhận xác nhận)
CREATE OR REPLACE FUNCTION public.request_member_transfer(
  p_member_id uuid,
  p_target_department_id uuid,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_dept_id uuid;
  v_is_owner boolean;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT department_id INTO v_current_dept_id
  FROM public.members
  WHERE id = p_member_id;

  IF v_current_dept_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy đoàn viên';
  END IF;

  IF v_current_dept_id = p_target_department_id THEN
    RAISE EXCEPTION 'Đoàn viên đã thuộc chi đoàn này';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = p_target_department_id) THEN
    RAISE EXCEPTION 'Không tìm thấy chi đoàn đích';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = v_current_dept_id AND user_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Bạn không có quyền gửi yêu cầu chuyển đoàn viên này';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_transfer_requests
    WHERE member_id = p_member_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Đoàn viên này đang có yêu cầu chuyển chi đoàn chờ xác nhận';
  END IF;

  INSERT INTO public.member_transfer_requests (
    member_id, from_department_id, to_department_id, status, note, created_by
  )
  VALUES (
    p_member_id, v_current_dept_id, p_target_department_id, 'pending', p_note, auth.uid()
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_member_transfer(uuid, uuid, text) TO authenticated;

-- 2. RPC Bí thư chi đoàn bên nhận xác nhận (p_approve = true) hoặc từ chối (p_approve = false)
CREATE OR REPLACE FUNCTION public.respond_member_transfer(
  p_request_id uuid,
  p_approve boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_is_receiver boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_req
  FROM public.member_transfer_requests
  WHERE id = p_request_id;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu chuyển chi đoàn';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý trước đó';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = v_req.to_department_id AND user_id = auth.uid()
  ) INTO v_is_receiver;

  IF NOT v_is_receiver AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ Bí thư chi đoàn bên nhận mới có quyền xác nhận hoặc từ chối';
  END IF;

  IF p_approve THEN
    -- Chuyển đoàn viên và toàn bộ dữ liệu chấm điểm sang chi đoàn mới
    UPDATE public.members
    SET department_id = v_req.to_department_id
    WHERE id = v_req.member_id;

    UPDATE public.evaluations
    SET department_id = v_req.to_department_id
    WHERE member_id = v_req.member_id;

    UPDATE public.member_transfer_requests
    SET status = 'approved',
        resolved_by = auth.uid(),
        resolved_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
  ELSE
    -- Từ chối: đoàn viên vẫn giữ nguyên ở chi đoàn cũ
    UPDATE public.member_transfer_requests
    SET status = 'rejected',
        resolved_by = auth.uid(),
        resolved_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_member_transfer(uuid, boolean) TO authenticated;

-- 3. RPC cho chi đoàn bên gửi hủy yêu cầu đang chờ xử lý
CREATE OR REPLACE FUNCTION public.cancel_member_transfer(
  p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_is_sender boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_req
  FROM public.member_transfer_requests
  WHERE id = p_request_id;

  IF v_req IS NULL OR v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu đang chờ xử lý';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = v_req.from_department_id AND user_id = auth.uid()
  ) INTO v_is_sender;

  IF NOT v_is_sender AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Bạn không có quyền hủy yêu cầu này';
  END IF;

  UPDATE public.member_transfer_requests
  SET status = 'cancelled',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc'::text, now())
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_member_transfer(uuid) TO authenticated;


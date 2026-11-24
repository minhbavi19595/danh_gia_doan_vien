-- 10_period_snapshots_and_auto_lock.sql
-- Tự động chốt kỳ bình xét vào ngày 19/11 hàng năm (giờ Việt Nam)
-- Giữ nguyên tổ/chức danh của các kỳ cũ khi xem lại; luân chuyển trong kỳ mới chỉ chuyển điểm của kỳ mới

-- 1. Bảng lưu các kỳ bình xét đã chốt
CREATE TABLE IF NOT EXISTS public.locked_periods (
  review_year int PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Bảng chụp danh sách đoàn viên theo đúng Chi đoàn & Chức danh tại thời điểm chốt kỳ (19/11)
CREATE TABLE IF NOT EXISTS public.period_member_snapshots (
  review_year int NOT NULL,
  member_id uuid NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (review_year, member_id)
);

CREATE INDEX IF NOT EXISTS idx_period_snapshots_year_dept
ON public.period_member_snapshots(review_year, department_id);

ALTER TABLE public.locked_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_member_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view locked_periods" ON public.locked_periods;
CREATE POLICY "Authenticated can view locked_periods"
ON public.locked_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage locked_periods" ON public.locked_periods;
CREATE POLICY "Admin can manage locked_periods"
ON public.locked_periods FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated can view period_member_snapshots" ON public.period_member_snapshots;
CREATE POLICY "Authenticated can view period_member_snapshots"
ON public.period_member_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage period_member_snapshots" ON public.period_member_snapshots;
CREATE POLICY "Admin can manage period_member_snapshots"
ON public.period_member_snapshots FOR ALL USING (public.is_admin());

-- 3. Hàm hỗ trợ tính kỳ bình xét đang mở hiện tại (theo giờ VN, từ 20/11 trở đi sang kỳ năm sau)
CREATE OR REPLACE FUNCTION public.get_active_review_year()
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now timestamp := timezone('Asia/Ho_Chi_Minh', now());
  v_year int := extract(year from v_now)::int;
  v_month int := extract(month from v_now)::int;
  v_day int := extract(day from v_now)::int;
BEGIN
  IF v_month = 12 OR (v_month = 11 AND v_day >= 20) THEN
    RETURN v_year + 1;
  END IF;
  RETURN v_year;
END;
$$;

-- 4. Hàm tự động chốt kỳ vào ngày 19/11 hàng năm (idempotent: đã chốt rồi thì không ghi đè)
CREATE OR REPLACE FUNCTION public.ensure_closed_periods()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamp := timezone('Asia/Ho_Chi_Minh', now());
  v_year int := extract(year from v_now)::int;
  v_month int := extract(month from v_now)::int;
  v_day int := extract(day from v_now)::int;
  v_close_year int;
BEGIN
  -- Từ ngày 19/11 trở đi: tự động chốt kỳ của năm hiện tại (T12/(Y-1) -> T11/Y)
  IF v_month > 11 OR (v_month = 11 AND v_day >= 19) THEN
    v_close_year := v_year;
  ELSE
    v_close_year := v_year - 1;
  END IF;

  IF v_close_year < 2025 THEN
    RETURN;
  END IF;

  -- Nếu kỳ này chưa được chốt và đã có dữ liệu đoàn viên/đánh giá thì tiến hành chốt
  IF NOT EXISTS (SELECT 1 FROM public.locked_periods WHERE review_year = v_close_year)
     AND EXISTS (
       SELECT 1 FROM public.evaluations
       WHERE (year = v_close_year - 1 AND month = 12)
          OR (year = v_close_year AND month BETWEEN 1 AND 11)
     ) THEN
    -- Chụp snapshot toàn bộ đoàn viên hiện có (ưu tiên department_id trong evaluations của kỳ đó nếu có)
    INSERT INTO public.period_member_snapshots (review_year, member_id, department_id, full_name, title, created_at)
    SELECT
      v_close_year,
      m.id,
      COALESCE(
        (
          SELECT e.department_id
          FROM public.evaluations e
          WHERE e.member_id = m.id
            AND ((e.year = v_close_year - 1 AND e.month = 12) OR (e.year = v_close_year AND e.month BETWEEN 1 AND 11))
            AND e.department_id IS NOT NULL
          ORDER BY e.year DESC, e.month DESC
          LIMIT 1
        ),
        m.department_id
      ),
      m.full_name,
      m.title,
      m.created_at
    FROM public.members m
    ON CONFLICT (review_year, member_id) DO NOTHING;

    INSERT INTO public.locked_periods (review_year)
    VALUES (v_close_year)
    ON CONFLICT (review_year) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_closed_periods() TO authenticated;

-- 5. Cập nhật RPC respond_member_transfer: chỉ chuyển điểm của KỲ ĐANG MỞ sang tổ mới, giữ nguyên tổ cũ cho các kỳ đã chốt
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
  v_active_review_year int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Đảm bảo kỳ cũ đã được tự chốt nếu đã qua 19/11
  PERFORM public.ensure_closed_periods();
  v_active_review_year := public.get_active_review_year();

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
    -- Chuyển đoàn viên sang chi đoàn mới
    UPDATE public.members
    SET department_id = v_req.to_department_id
    WHERE id = v_req.member_id;

    -- CHỈ chuyển dữ liệu chấm điểm thuộc KỲ ĐANG MỞ sang chi đoàn mới; các kỳ cũ giữ nguyên tổ cũ
    UPDATE public.evaluations
    SET department_id = v_req.to_department_id
    WHERE member_id = v_req.member_id
      AND (
        (year = v_active_review_year - 1 AND month = 12)
        OR (year = v_active_review_year AND month BETWEEN 1 AND 11)
      );

    UPDATE public.member_transfer_requests
    SET status = 'approved',
        resolved_by = auth.uid(),
        resolved_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
  ELSE
    UPDATE public.member_transfer_requests
    SET status = 'rejected',
        resolved_by = auth.uid(),
        resolved_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
  END IF;
END;
$$;

-- 6. Tắt trigger tự gộp theo tên cũ (phục vụ giai đoạn import Excel trước đây)
--    để tránh việc thêm đoàn viên mới lách qua quy trình xác nhận chuyển chi đoàn và ghi đè tổ kỳ cũ
DROP TRIGGER IF EXISTS trg_member_auto_merge_by_name ON public.members;

-- 7. RPC kiểm tra trùng tên đoàn viên trên toàn trung tâm (để cảnh báo khi thêm/sửa tên)
CREATE OR REPLACE FUNCTION public.check_duplicate_member_name(
  p_full_name text,
  p_exclude_member_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  full_name text,
  department_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_norm := lower(trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')));
  IF v_norm = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      m.id,
      m.full_name,
      COALESCE(d.name, 'Không rõ chi đoàn') AS department_name
    FROM public.members m
    LEFT JOIN public.departments d ON d.id = m.department_id
    WHERE lower(trim(regexp_replace(coalesce(m.full_name, ''), '\s+', ' ', 'g'))) = v_norm
      AND (p_exclude_member_id IS NULL OR m.id <> p_exclude_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_duplicate_member_name(text, uuid) TO authenticated;




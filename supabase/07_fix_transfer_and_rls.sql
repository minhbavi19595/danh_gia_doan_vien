-- 07_fix_transfer_and_rls.sql
-- 1. Không cho phép Bí thư chi đoàn xóa đoàn viên trực tiếp (chỉ cho SELECT, INSERT, UPDATE)
DROP POLICY IF EXISTS "Departments can manage their members" ON public.members;
DROP POLICY IF EXISTS "Departments can view their members" ON public.members;
DROP POLICY IF EXISTS "Departments can insert their members" ON public.members;
DROP POLICY IF EXISTS "Departments can update their members" ON public.members;

CREATE POLICY "Departments can view their members"
ON public.members FOR SELECT
USING (
  department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
);

CREATE POLICY "Departments can insert their members"
ON public.members FOR INSERT
WITH CHECK (
  department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
);

CREATE POLICY "Departments can update their members"
ON public.members FOR UPDATE
USING (
  department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
)
WITH CHECK (
  department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
);

-- 2. RPC chuyển sinh hoạt đoàn viên sang chi đoàn mới, đồng thời chuyển toàn bộ dữ liệu chấm (evaluations) theo
CREATE OR REPLACE FUNCTION public.transfer_member(
  p_member_id uuid,
  p_target_department_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_dept_id uuid;
  v_is_owner boolean;
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

  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = p_target_department_id) THEN
    RAISE EXCEPTION 'Không tìm thấy chi đoàn đích';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = v_current_dept_id AND user_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Bạn không có quyền chuyển đoàn viên này';
  END IF;

  IF v_current_dept_id = p_target_department_id THEN
    RETURN;
  END IF;

  UPDATE public.members
  SET department_id = p_target_department_id
  WHERE id = p_member_id;

  UPDATE public.evaluations
  SET department_id = p_target_department_id
  WHERE member_id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_member(uuid, uuid) TO authenticated;

-- 3. Hàm chuẩn hóa họ tên để nhận diện đoàn viên giữa các chi đoàn
CREATE OR REPLACE FUNCTION public.normalize_member_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
$$;

-- 4. Trigger tự động nhận diện theo tên khi chi đoàn mới nhập/import đoàn viên mà không bấm chuyển tổ:
--    Kéo toàn bộ lịch sử điểm (evaluations) từ bản ghi cũ ở chi đoàn cũ sang bản ghi mới ở chi đoàn mới và xóa bản ghi cũ.
CREATE OR REPLACE FUNCTION public.handle_member_auto_merge_by_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_name text;
  r_old record;
BEGIN
  v_norm_name := public.normalize_member_name(NEW.full_name);
  IF v_norm_name = '' THEN
    RETURN NEW;
  END IF;

  FOR r_old IN
    SELECT id, department_id
    FROM public.members
    WHERE id <> NEW.id
      AND public.normalize_member_name(full_name) = v_norm_name
    ORDER BY created_at ASC
  LOOP
    -- Chuyển các tháng điểm chưa có ở bản ghi mới sang bản ghi mới & chi đoàn mới
    UPDATE public.evaluations e_old
    SET member_id = NEW.id,
        department_id = NEW.department_id
    WHERE e_old.member_id = r_old.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.evaluations e_new
        WHERE e_new.member_id = NEW.id
          AND e_new.year = e_old.year
          AND e_new.month = e_old.month
      );

    -- Xóa bản ghi cũ (các evaluations trùng tháng nếu có sẽ tự cascade)
    DELETE FROM public.members WHERE id = r_old.id;
  END LOOP;

  -- Đồng bộ department_id cho toàn bộ evaluations của đoàn viên này
  UPDATE public.evaluations
  SET department_id = NEW.department_id
  WHERE member_id = NEW.id
    AND (department_id IS NULL OR department_id <> NEW.department_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_auto_merge_by_name ON public.members;
CREATE TRIGGER trg_member_auto_merge_by_name
AFTER INSERT ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.handle_member_auto_merge_by_name();

-- 5. Gộp ngay dữ liệu trùng tên đã tồn tại sẵn trong DB về chi đoàn mới nhất
DO $$
DECLARE
  r_dup record;
  v_keep_id uuid;
  v_keep_dept uuid;
  r_old record;
BEGIN
  FOR r_dup IN
    SELECT public.normalize_member_name(full_name) AS norm_name
    FROM public.members
    WHERE public.normalize_member_name(full_name) <> ''
    GROUP BY public.normalize_member_name(full_name)
    HAVING count(*) > 1
  LOOP
    -- Chọn bản ghi mới nhất (ưu tiên bản ghi có đánh giá ở tháng gần nhất, sau đó theo created_at mới nhất)
    SELECT m.id, m.department_id
    INTO v_keep_id, v_keep_dept
    FROM public.members m
    LEFT JOIN LATERAL (
      SELECT max(e.year * 100 + e.month) AS latest_ym
      FROM public.evaluations e
      WHERE e.member_id = m.id
    ) ev ON true
    WHERE public.normalize_member_name(m.full_name) = r_dup.norm_name
    ORDER BY m.created_at DESC, coalesce(ev.latest_ym, 0) DESC
    LIMIT 1;

    FOR r_old IN
      SELECT id
      FROM public.members
      WHERE public.normalize_member_name(full_name) = r_dup.norm_name
        AND id <> v_keep_id
    LOOP
      UPDATE public.evaluations e_old
      SET member_id = v_keep_id,
          department_id = v_keep_dept
      WHERE e_old.member_id = r_old.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.evaluations e_keep
          WHERE e_keep.member_id = v_keep_id
            AND e_keep.year = e_old.year
            AND e_keep.month = e_old.month
        );

      DELETE FROM public.members WHERE id = r_old.id;
    END LOOP;

    UPDATE public.evaluations
    SET department_id = v_keep_dept
    WHERE member_id = v_keep_id
      AND (department_id IS NULL OR department_id <> v_keep_dept);
  END LOOP;
END;
$$;

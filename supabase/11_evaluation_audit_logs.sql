-- 11_evaluation_audit_logs.sql
-- Bảng nhật ký chỉnh sửa điểm bất biến (chỉ ghi qua Trigger DB, không ai được sửa/xóa)
-- Giúp Admin kiểm soát toàn bộ lịch sử chỉnh sửa điểm của Bí thư Đoàn tránh gian lận

CREATE TABLE IF NOT EXISTS public.evaluation_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE SET NULL,
  member_id uuid,
  member_name text,
  department_id uuid,
  department_name text,
  year int NOT NULL,
  month int NOT NULL,
  action text NOT NULL, -- 'bch_edit', 'approve', 'department_update'
  changed_by uuid,
  changed_by_email text,
  changed_by_role text,
  old_status text,
  new_status text,
  old_effective_total int,
  new_effective_total int,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_eval_audit_logs_created_at ON public.evaluation_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_audit_logs_year_month ON public.evaluation_audit_logs(year, month);
CREATE INDEX IF NOT EXISTS idx_eval_audit_logs_role ON public.evaluation_audit_logs(changed_by_role);

ALTER TABLE public.evaluation_audit_logs ENABLE ROW LEVEL SECURITY;

-- Chỉ Admin được xem lịch sử; KHÔNG cấp quyền INSERT/UPDATE/DELETE cho bất kỳ client nào (bất biến)
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.evaluation_audit_logs;
CREATE POLICY "Admin can view audit logs"
ON public.evaluation_audit_logs FOR SELECT
USING (public.is_admin());

-- Trigger tự động ghi log mỗi khi có chỉnh sửa điểm hoặc thay đổi trạng thái trên public.evaluations
CREATE OR REPLACE FUNCTION public.log_evaluation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_member_name text;
  v_dept_name text;
  v_action text;
  v_old_total int;
  v_new_total int;
  v_bch_changed boolean;
  v_cd_changed boolean;
  v_status_changed boolean;
BEGIN
  v_bch_changed :=
    OLD.bch_score_1 IS DISTINCT FROM NEW.bch_score_1 OR
    OLD.bch_score_2 IS DISTINCT FROM NEW.bch_score_2 OR
    OLD.bch_score_3 IS DISTINCT FROM NEW.bch_score_3 OR
    OLD.bch_score_4 IS DISTINCT FROM NEW.bch_score_4 OR
    OLD.bch_score_5 IS DISTINCT FROM NEW.bch_score_5 OR
    OLD.bch_note IS DISTINCT FROM NEW.bch_note;

  v_cd_changed :=
    OLD.score_1 IS DISTINCT FROM NEW.score_1 OR
    OLD.score_2 IS DISTINCT FROM NEW.score_2 OR
    OLD.score_3 IS DISTINCT FROM NEW.score_3 OR
    OLD.score_4 IS DISTINCT FROM NEW.score_4 OR
    OLD.score_5 IS DISTINCT FROM NEW.score_5 OR
    OLD.note IS DISTINCT FROM NEW.note;

  v_status_changed := OLD.status IS DISTINCT FROM NEW.status;

  -- Nếu chỉ đổi department_id do chuyển chi đoàn mà không đổi điểm/trạng thái thì không cần ghi log sửa điểm
  IF NOT v_bch_changed AND NOT v_cd_changed AND NOT v_status_changed THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT u.email, (u.raw_user_meta_data->>'role')::text
    INTO v_email, v_role
    FROM auth.users u
    WHERE u.id = v_user_id;
  END IF;

  SELECT m.full_name INTO v_member_name
  FROM public.members m
  WHERE m.id = NEW.member_id;

  SELECT d.name INTO v_dept_name
  FROM public.departments d
  WHERE d.id = COALESCE(NEW.department_id, OLD.department_id);

  IF v_bch_changed OR NEW.status = 'rejected' THEN
    v_action := 'bch_edit';
  ELSIF v_status_changed AND NEW.status = 'approved' THEN
    v_action := 'approve';
  ELSE
    v_action := 'department_update';
  END IF;

  v_old_total := CASE WHEN OLD.status = 'rejected' THEN COALESCE(OLD.bch_total_score, 0) ELSE COALESCE(OLD.total_score, 0) END;
  v_new_total := CASE WHEN NEW.status = 'rejected' THEN COALESCE(NEW.bch_total_score, 0) ELSE COALESCE(NEW.total_score, 0) END;

  INSERT INTO public.evaluation_audit_logs (
    evaluation_id,
    member_id,
    member_name,
    department_id,
    department_name,
    year,
    month,
    action,
    changed_by,
    changed_by_email,
    changed_by_role,
    old_status,
    new_status,
    old_effective_total,
    new_effective_total,
    old_data,
    new_data
  ) VALUES (
    NEW.id,
    NEW.member_id,
    COALESCE(v_member_name, 'Không rõ'),
    COALESCE(NEW.department_id, OLD.department_id),
    COALESCE(v_dept_name, 'Không rõ'),
    NEW.year,
    NEW.month,
    v_action,
    v_user_id,
    COALESCE(v_email, 'system'),
    COALESCE(v_role, 'unknown'),
    OLD.status,
    NEW.status,
    v_old_total,
    v_new_total,
    jsonb_build_object(
      'score_1', OLD.score_1, 'score_2', OLD.score_2, 'score_3', OLD.score_3, 'score_4', OLD.score_4, 'score_5', OLD.score_5,
      'total_score', OLD.total_score, 'note', OLD.note,
      'bch_score_1', OLD.bch_score_1, 'bch_score_2', OLD.bch_score_2, 'bch_score_3', OLD.bch_score_3, 'bch_score_4', OLD.bch_score_4, 'bch_score_5', OLD.bch_score_5,
      'bch_total_score', OLD.bch_total_score, 'bch_note', OLD.bch_note
    ),
    jsonb_build_object(
      'score_1', NEW.score_1, 'score_2', NEW.score_2, 'score_3', NEW.score_3, 'score_4', NEW.score_4, 'score_5', NEW.score_5,
      'total_score', NEW.total_score, 'note', NEW.note,
      'bch_score_1', NEW.bch_score_1, 'bch_score_2', NEW.bch_score_2, 'bch_score_3', NEW.bch_score_3, 'bch_score_4', NEW.bch_score_4, 'bch_score_5', NEW.bch_score_5,
      'bch_total_score', NEW.bch_total_score, 'bch_note', NEW.bch_note
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_evaluation_changes ON public.evaluations;
CREATE TRIGGER trg_log_evaluation_changes
AFTER UPDATE ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.log_evaluation_update();


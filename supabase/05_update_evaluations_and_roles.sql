-- 05_update_evaluations_and_roles.sql
-- 1. Thêm các cột mới cho evaluations
ALTER TABLE public.evaluations 
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS bch_score_1 int DEFAULT null CHECK (bch_score_1 >= 0),
ADD COLUMN IF NOT EXISTS bch_score_2 int DEFAULT null CHECK (bch_score_2 >= 0),
ADD COLUMN IF NOT EXISTS bch_score_3 int DEFAULT null CHECK (bch_score_3 >= 0),
ADD COLUMN IF NOT EXISTS bch_score_4 int DEFAULT null CHECK (bch_score_4 >= 0),
ADD COLUMN IF NOT EXISTS bch_score_5 int DEFAULT null CHECK (bch_score_5 >= 0),
ADD COLUMN IF NOT EXISTS bch_total_score int GENERATED ALWAYS AS (
  COALESCE(bch_score_1, 0) + COALESCE(bch_score_2, 0) + COALESCE(bch_score_3, 0) + COALESCE(bch_score_4, 0) + COALESCE(bch_score_5, 0)
) STORED,
ADD COLUMN IF NOT EXISTS bch_note text;

-- Cập nhật department_id cho các record đánh giá cũ
UPDATE public.evaluations e
SET department_id = m.department_id
FROM public.members m
WHERE e.member_id = m.id AND e.department_id IS NULL;

-- Thay đổi bảng departments để cho phép tạo Chi đoàn trước khi gán tài khoản
ALTER TABLE public.departments ALTER COLUMN user_id DROP NOT NULL;
-- 2. Cập nhật RLS Policies
CREATE OR REPLACE FUNCTION public.is_bi_thu_doan()
RETURNS boolean AS $$
BEGIN
  RETURN coalesce((current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'), '') = 'bi_thu_doan';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sửa lại Policy của members để bí thư đoàn xem được
DROP POLICY IF EXISTS "Bi thu doan can view all members" ON public.members;
CREATE POLICY "Bi thu doan can view all members" ON public.members FOR SELECT USING (public.is_bi_thu_doan());

-- Sửa lại Policy của departments để tất cả tài khoản (gồm Bí thư Chi đoàn) đều xem được danh sách để chọn khi chuyển sinh hoạt
DROP POLICY IF EXISTS "All authenticated users can view departments" ON public.departments;
CREATE POLICY "All authenticated users can view departments" ON public.departments FOR SELECT TO authenticated USING (true);

-- (Bỏ policy cũ "Bi thu doan can view all departments" vì policy trên đã bao hàm)
DROP POLICY IF EXISTS "Bi thu doan can view all departments" ON public.departments;

-- Sửa lại Policy của evaluations
DROP POLICY IF EXISTS "Departments can manage their evaluations" ON public.evaluations;
-- Bí thư chi đoàn (bi_thu_chi_doan) quản lý đánh giá của chi đoàn mình theo department_id trực tiếp trên evaluations
CREATE POLICY "Departments can manage their evaluations" ON public.evaluations FOR ALL USING (
  department_id IN (SELECT id FROM public.departments WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Bi thu doan can view and update evaluations" ON public.evaluations;
CREATE POLICY "Bi thu doan can view and update evaluations" ON public.evaluations FOR ALL USING (
  public.is_bi_thu_doan()
);

-- 3. Đổi role 'department' cũ thành 'bi_thu_chi_doan'
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{role}', '"bi_thu_chi_doan"')
WHERE raw_user_meta_data->>'role' = 'department';

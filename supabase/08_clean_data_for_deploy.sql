-- 08_clean_data_for_deploy.sql
-- Dọn sạch dữ liệu thử nghiệm trước khi triển khai chính thức:
-- GIỮ NGUYÊN: Tài khoản (auth.users, auth.identities) và Danh sách Chi đoàn (public.departments)
-- XÓA TOÀN BỘ: Dữ liệu chấm điểm (public.evaluations) và Danh sách đoàn viên (public.members)

BEGIN;

-- 1. Xóa toàn bộ dữ liệu đánh giá / chấm điểm các tháng
DELETE FROM public.evaluations;

-- 2. Xóa toàn bộ danh sách đoàn viên trong các chi đoàn
DELETE FROM public.members;

COMMIT;


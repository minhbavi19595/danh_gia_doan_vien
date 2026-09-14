-- Migration: Thêm đánh giá theo tháng
-- Chạy script này để cập nhật bảng evaluations hiện tại mà không làm mất dữ liệu

-- 1. Thêm cột month (mặc định là 1 cho các dữ liệu cũ để tránh lỗi Not Null)
ALTER TABLE public.evaluations 
ADD COLUMN IF NOT EXISTS month int NOT NULL DEFAULT 1 CHECK (month >= 1 AND month <= 12);

-- 2. Xóa unique constraint cũ (member_id, year)
-- Lưu ý: Tên constraint có thể khác tùy thuộc vào lúc tạo bảng. Mặc định của Supabase thường là tên_bảng_cot1_cot2_key
ALTER TABLE public.evaluations 
DROP CONSTRAINT IF EXISTS evaluations_member_id_year_key;

-- 3. Thêm unique constraint mới bao gồm cả month (member_id, year, month)
ALTER TABLE public.evaluations 
ADD CONSTRAINT evaluations_member_id_year_month_key UNIQUE (member_id, year, month);

-- Lưu ý: Nếu có view hoặc function nào phụ thuộc vào schema cũ, hãy cập nhật lại (hiện tại trong dự án không có).

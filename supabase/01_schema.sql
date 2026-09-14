-- 01_schema.sql
-- Run this in Supabase SQL Editor

-- Enable uuid extension
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 1. Create tables
create table if not exists public.departments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

create table if not exists public.members (
  id uuid primary key default uuid_generate_v4(),
  department_id uuid references public.departments(id) on delete cascade not null,
  full_name text not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.evaluations (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references public.members(id) on delete cascade not null,
  year int not null,
  month int not null check (month >= 1 and month <= 12),
  score_1 int default 0 check (score_1 >= 0), -- Lý tưởng cách mạng, nhận thức chính trị
  score_2 int default 0 check (score_2 >= 0), -- Đạo đức, lối sống, tác phong đoàn viên
  score_3 int default 0 check (score_3 >= 0), -- Công tác chuyên môn nghiệp vụ
  score_4 int default 0 check (score_4 >= 0), -- Rèn luyện sức khoẻ
  score_5 int default 0 check (score_5 >= 0), -- Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn
  total_score int generated always as (
    coalesce(score_1, 0) + coalesce(score_2, 0) + coalesce(score_3, 0) + coalesce(score_4, 0) + coalesce(score_5, 0)
  ) stored,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (member_id, year, month)
);

-- 2. Row Level Security (RLS)

-- Enable RLS
alter table public.departments enable row level security;
alter table public.members enable row level security;
alter table public.evaluations enable row level security;

-- Admin role check function
create or replace function public.is_admin()
returns boolean as $$
begin
  return coalesce((current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'), '') = 'admin';
end;
$$ language plpgsql security definer;

-- Department Policy
create policy "Admin can do all on departments" on public.departments for all using (public.is_admin());
create policy "Users can view their own department" on public.departments for select using (auth.uid() = user_id);

-- Members Policy
create policy "Admin can do all on members" on public.members for all using (public.is_admin());
create policy "Departments can manage their members" on public.members for all using (
  department_id in (select id from public.departments where user_id = auth.uid())
);

-- Evaluations Policy
create policy "Admin can do all on evaluations" on public.evaluations for all using (public.is_admin());
create policy "Departments can manage their evaluations" on public.evaluations for all using (
  member_id in (select m.id from public.members m join public.departments d on m.department_id = d.id where d.user_id = auth.uid())
);

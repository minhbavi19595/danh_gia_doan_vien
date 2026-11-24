import { supabase } from '@/lib/supabase';
import { getReviewYear } from '@/lib/evaluationPeriod';

export async function fetchMembersForPeriod(
  year: number,
  month: number,
  departmentId?: string | null
): Promise<{ members: any[]; isLockedPeriod: boolean }> {
  const reviewYear = getReviewYear(year, month);

  // Đảm bảo kỳ cũ đã được tự động chốt nếu đã qua 19/11 (an toàn nếu DB chưa chạy migration 10)
  await supabase.rpc('ensure_closed_periods').then(() => {}, () => {});

  const { data: lockedRow, error: lockErr } = await supabase
    .from('locked_periods')
    .select('review_year')
    .eq('review_year', reviewYear)
    .maybeSingle();

  const isLockedPeriod = !lockErr && !!lockedRow;

  if (isLockedPeriod) {
    let snapQuery = supabase
      .from('period_member_snapshots')
      .select('member_id, department_id, full_name, title, created_at')
      .eq('review_year', reviewYear)
      .order('created_at', { ascending: true });

    if (departmentId) {
      snapQuery = snapQuery.eq('department_id', departmentId);
    }

    const { data: snapData, error: snapErr } = await snapQuery;
    if (!snapErr && snapData) {
      return {
        isLockedPeriod: true,
        members: snapData.map((s) => ({
          id: s.member_id,
          department_id: s.department_id,
          full_name: s.full_name,
          title: s.title,
          created_at: s.created_at,
        })),
      };
    }
  }

  let memberQuery = supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: true });

  if (departmentId) {
    memberQuery = memberQuery.eq('department_id', departmentId);
  }

  const { data: membersData } = await memberQuery;
  return {
    isLockedPeriod: false,
    members: membersData || [],
  };
}


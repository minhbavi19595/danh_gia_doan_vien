'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { History, Search, RefreshCw, ShieldAlert } from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';

export default function AuditLogsPage() {
  const { role } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('bch_edit');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('evaluation_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role && role !== 'admin') {
      router.replace('/');
      return;
    }
    if (role === 'admin') {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const filteredLogs = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (roleFilter !== 'all' && log.changed_by_role !== roleFilter) return false;
      if (kw) {
        const matchMember = log.member_name?.toLowerCase().includes(kw);
        const matchDept = log.department_name?.toLowerCase().includes(kw);
        const matchEmail = log.changed_by_email?.toLowerCase().includes(kw);
        if (!matchMember && !matchDept && !matchEmail) return false;
      }
      return true;
    });
  }, [logs, actionFilter, roleFilter, searchTerm]);

  const getScoreDiffs = (log: any) => {
    const oldD = log.old_data || {};
    const newD = log.new_data || {};
    const diffs: string[] = [];

    if (log.action === 'bch_edit') {
      for (let i = 1; i <= 5; i++) {
        const oldVal = log.old_status === 'rejected' ? oldD[`bch_score_${i}`] : oldD[`score_${i}`];
        const newVal = newD[`bch_score_${i}`];
        if (oldVal !== newVal) {
          diffs.push(`TC${i}: ${oldVal ?? '-'} → ${newVal ?? '-'}`);
        }
      }
    } else if (log.action === 'department_update') {
      for (let i = 1; i <= 5; i++) {
        const oldVal = oldD[`score_${i}`];
        const newVal = newD[`score_${i}`];
        if (oldVal !== newVal) {
          diffs.push(`TC${i}: ${oldVal ?? '-'} → ${newVal ?? '-'}`);
        }
      }
    }
    return diffs;
  };

  const getActionBadge = (action: string) => {
    if (action === 'bch_edit') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">
          BCH sửa điểm
        </span>
      );
    }
    if (action === 'approve') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
          Duyệt điểm
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
        Chi đoàn sửa
      </span>
    );
  };

  const getRoleLabel = (r: string) => {
    if (r === 'bi_thu_doan') return 'Bí thư Đoàn';
    if (r === 'admin') return 'Admin';
    if (r === 'bi_thu_chi_doan' || r === 'department') return 'Bí thư CĐ';
    return r || 'Không rõ';
  };

  if (role !== 'admin') return null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <History size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Nhật ký chỉnh sửa điểm
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <ShieldAlert size={13} className="text-amber-400" />
              Ghi nhận tự động từ hệ thống cơ sở dữ liệu — không thể xóa hoặc chỉnh sửa
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            size="xs"
            value={actionFilter}
            onChange={(val) => setActionFilter(val)}
            options={[
              { value: 'bch_edit', label: 'Chỉ lần BCH sửa điểm' },
              { value: 'all', label: 'Tất cả thao tác' },
              { value: 'approve', label: 'Duyệt điểm' },
              { value: 'department_update', label: 'Chi đoàn sửa điểm' },
            ]}
          />

          <CustomSelect
            size="xs"
            value={roleFilter}
            onChange={(val) => setRoleFilter(val)}
            options={[
              { value: 'all', label: 'Mọi tài khoản' },
              { value: 'bi_thu_doan', label: 'Chỉ Bí thư Đoàn' },
              { value: 'bi_thu_chi_doan', label: 'Bí thư Chi đoàn' },
              { value: 'admin', label: 'Admin' },
            ]}
          />

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm tên, chi đoàn, email..."
              className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-8 pr-3 py-1.5 w-48 text-xs focus:outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={fetchLogs}
            className="btn btn-secondary py-1.5 px-3 text-xs"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="table-th text-xs w-36">Thời gian</th>
                <th className="table-th text-xs">Người thực hiện</th>
                <th className="table-th text-xs">Đoàn viên / Chi đoàn</th>
                <th className="table-th text-center text-xs w-20">Kỳ</th>
                <th className="table-th text-center text-xs w-28">Hành động</th>
                <th className="table-th text-center text-xs w-36">Điểm cũ → mới</th>
                <th className="table-th text-xs">Chi tiết thay đổi & Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Đang tải nhật ký...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Chưa có lịch sử chỉnh sửa nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const diff = (log.new_effective_total ?? 0) - (log.old_effective_total ?? 0);
                  const scoreDiffs = getScoreDiffs(log);
                  const noteAfter =
                    log.action === 'bch_edit'
                      ? log.new_data?.bch_note
                      : log.new_data?.note;

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="table-td text-xs text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </td>
                      <td className="table-td text-xs">
                        <div className="font-medium text-white">{log.changed_by_email}</div>
                        <span className="text-[10px] text-slate-400">{getRoleLabel(log.changed_by_role)}</span>
                      </td>
                      <td className="table-td text-xs">
                        <div className="font-semibold text-white">{log.member_name}</div>
                        <div className="text-[11px] text-slate-400">{log.department_name}</div>
                      </td>
                      <td className="table-td text-center text-xs text-slate-300 whitespace-nowrap">
                        T{log.month}/{log.year}
                      </td>
                      <td className="table-td text-center">{getActionBadge(log.action)}</td>
                      <td className="table-td text-center text-xs whitespace-nowrap">
                        <span className="text-slate-400">{log.old_effective_total ?? '-'}</span>
                        <span className="mx-1.5 text-slate-500">→</span>
                        <span className="font-bold text-white">{log.new_effective_total ?? '-'}</span>
                        {diff !== 0 && (
                          <span
                            className={`ml-1.5 text-[11px] font-semibold ${
                              diff > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ({diff > 0 ? `+${diff}` : diff})
                          </span>
                        )}
                      </td>
                      <td className="table-td text-xs text-slate-300">
                        {scoreDiffs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {scoreDiffs.map((d, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-amber-200"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                        {noteAfter && (
                          <div className="text-[11px] text-slate-400 italic">
                            Ghi chú: {noteAfter}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


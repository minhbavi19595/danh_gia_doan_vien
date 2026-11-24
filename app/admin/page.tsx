'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, TrendingUp, Award, AlertTriangle, Eye } from 'lucide-react';
import Link from 'next/link';
import { getMaxEvaluationPeriod, getAvailableYears, getAvailableMonths } from '@/lib/evaluationPeriod';

export default function AdminDashboard() {
  const { maxYear, maxMonth } = getMaxEvaluationPeriod();
  const [stats, setStats] = useState({ A: 0, B: 0, C: 0, D: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [departmentsData, setDepartmentsData] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState(maxYear);
  const [currentMonth, setCurrentMonth] = useState(maxMonth);

  useEffect(() => {
    fetchData();
  }, [currentYear, currentMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: evals, error: evalError } = await supabase
        .from('evaluations')
        .select(`
          total_score,
          bch_total_score,
          status,
          members!inner (
            department_id,
            departments ( id, name )
          )
        `)
        .eq('year', currentYear)
        .eq('month', currentMonth);

      if (evalError) throw evalError;

      let A = 0, B = 0, C = 0, D = 0;
      const deptMap: Record<string, any> = {};

      (evals || []).forEach(e => {
        const score = e.status === 'rejected' ? (e.bch_total_score || 0) : (e.total_score || 0);
        if (score <= 0) return;
        let type = '';
        if (score >= 90) { A++; type = 'A'; }
        else if (score >= 70) { B++; type = 'B'; }
        else if (score >= 50) { C++; type = 'C'; }
        else { D++; type = 'D'; }

        // @ts-ignore
        const deptName = e.members?.departments?.name || 'Không rõ';
        // @ts-ignore
        const deptId = e.members?.departments?.id || '';
        if (!deptMap[deptName]) {
          deptMap[deptName] = { id: deptId, A: 0, B: 0, C: 0, D: 0, total: 0 };
        }
        deptMap[deptName][type]++;
        deptMap[deptName].total++;
      });

      setStats({ A, B, C, D, total: A + B + C + D });
      setDepartmentsData(Object.entries(deptMap).map(([name, data]) => ({
        name, ...data
      })).sort((a, b) => b.total - a.total));

    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="h-8 bg-slate-800/50 rounded w-48 mb-2"></div>
            <div className="h-4 bg-slate-800/50 rounded w-72"></div>
          </div>
          <div className="h-12 bg-slate-800/50 rounded-xl w-64 border border-slate-700/50"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel p-6 border-t-4 border-slate-700/50">
              <div className="flex justify-between items-center mb-4">
                <div className="h-5 bg-slate-800/50 rounded w-32"></div>
                <div className="w-10 h-10 bg-slate-800/50 rounded-lg"></div>
              </div>
              <div className="h-10 bg-slate-800/50 rounded w-16"></div>
              <div className="h-4 bg-slate-800/50 rounded w-24 mt-2"></div>
            </div>
          ))}
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <div className="h-6 bg-slate-800/50 rounded w-64"></div>
            <div className="h-9 bg-slate-800/50 rounded-lg w-40"></div>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <div className="h-10 bg-slate-800/30 rounded mb-2"></div>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-slate-800/50 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Tổng quan Đánh giá</h1>
          <p className="text-slate-400">Thống kê kết quả đánh giá xếp loại toàn trung tâm</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
          <span className="text-slate-400">Năm:</span>
          <select 
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
            value={currentYear}
            onChange={(e) => {
              const y = parseInt(e.target.value);
              setCurrentYear(y);
              if (y === maxYear && currentMonth > maxMonth) {
                setCurrentMonth(maxMonth);
              }
            }}
          >
            {getAvailableYears(2024).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-slate-400">Tháng:</span>
          <select 
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
          >
            {getAvailableMonths(currentYear).map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-panel p-6 border-t-4 border-t-emerald-500 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-emerald-400">Hoàn thành Xuất sắc (A)</span>
            <div className="p-2 bg-emerald-500/10 rounded-lg"><Award className="text-emerald-500" size={24} /></div>
          </div>
          <div className="text-4xl font-bold">{stats.A}</div>
          <p className="text-slate-400 text-sm mt-2">Điểm ≥ 90</p>
        </div>

        <div className="glass-panel p-6 border-t-4 border-t-blue-500 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-blue-400">Hoàn thành Tốt (B)</span>
            <div className="p-2 bg-blue-500/10 rounded-lg"><TrendingUp className="text-blue-500" size={24} /></div>
          </div>
          <div className="text-4xl font-bold">{stats.B}</div>
          <p className="text-slate-400 text-sm mt-2">70 ≤ Điểm &lt; 90</p>
        </div>

        <div className="glass-panel p-6 border-t-4 border-t-amber-500 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-amber-400">Hoàn thành (C)</span>
            <div className="p-2 bg-amber-500/10 rounded-lg"><Users className="text-amber-500" size={24} /></div>
          </div>
          <div className="text-4xl font-bold">{stats.C}</div>
          <p className="text-slate-400 text-sm mt-2">50 ≤ Điểm &lt; 70</p>
        </div>

        <div className="glass-panel p-6 border-t-4 border-t-red-500 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-red-400">Không hoàn thành (D)</span>
            <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="text-red-500" size={24} /></div>
          </div>
          <div className="text-4xl font-bold">{stats.D}</div>
          <p className="text-slate-400 text-sm mt-2">Điểm &lt; 50</p>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
          <h2 className="text-lg font-bold">Báo cáo tổng hợp theo Phòng ban</h2>
          <Link href="/admin/evaluations/all" className="btn btn-secondary text-sm">
            Xem toàn bộ Trung tâm
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-th">Tên Phòng ban</th>
                <th className="table-th text-center">Tổng Đoàn viên</th>
                <th className="table-th text-center">Loại A (HTXSNV)</th>
                <th className="table-th text-center">Loại B (HTTNV)</th>
                <th className="table-th text-center">Loại C (HTNV)</th>
                <th className="table-th text-center">Loại D (KHTNV)</th>
                <th className="table-th text-center w-16">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {departmentsData.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-8 text-slate-400">Chưa có dữ liệu</td></tr>
              ) : (
                departmentsData.map((dept, i) => (
                  <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                    <td className="table-td font-medium">
                      <Link href={`/admin/evaluations/${dept.id}`} className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                        {dept.name}
                      </Link>
                    </td>
                    <td className="table-td text-center">{dept.total}</td>
                    <td className="table-td text-center"><span className="badge badge-a">{dept.A}</span></td>
                    <td className="table-td text-center"><span className="badge badge-b">{dept.B}</span></td>
                    <td className="table-td text-center"><span className="badge badge-c">{dept.C}</span></td>
                    <td className="table-td text-center"><span className="badge badge-d">{dept.D}</span></td>
                    <td className="table-td text-center">
                      <Link href={`/admin/evaluations/${dept.id}`} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors inline-flex" title="Xem chi tiết">
                        <Eye size={18} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

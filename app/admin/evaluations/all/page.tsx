'use client';

import React, { useState, useEffect, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AllDepartmentsDetail() {
  const router = useRouter();

  const [departments, setDepartments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => {
    fetchData();
  }, [currentYear, currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: deptsData } = await supabase
        .from('departments')
        .select('id, name')
        .order('name', { ascending: true });
        
      setDepartments(deptsData || []);

      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: true });

      setMembers(membersData || []);

      if (membersData && membersData.length > 0) {
        const { data: evalsData } = await supabase
          .from('evaluations')
          .select('*')
          .eq('year', currentYear)
          .eq('month', currentMonth);

        const evalsMap: Record<string, any> = {};
        (evalsData || []).forEach(ev => {
          evalsMap[ev.member_id] = ev;
        });
        setEvaluations(evalsMap);
      } else {
        setEvaluations({});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getRank = (score: number | null | undefined) => {
    if (score == null) return { text: '-', class: '', type: '' };
    if (score >= 90) return { text: 'HTXSNV', class: 'badge-a', type: 'A' };
    if (score >= 70) return { text: 'HTTNV', class: 'badge-b', type: 'B' };
    if (score >= 50) return { text: 'HTNV', class: 'badge-c', type: 'C' };
    return { text: 'KHTNV', class: 'badge-d', type: 'D' };
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];
    
    rows.push(['BẢNG ĐÁNH GIÁ CHI TIẾT TOÀN TRUNG TÂM']);
    rows.push([`Tháng ${currentMonth} năm ${currentYear}`]);
    rows.push([]);
    rows.push([
      'STT', 'Họ và tên', 'Chức danh',
      'Lý tưởng cách mạng, nhận thức chính trị', 'Đạo đức, lối sống, tác phong đoàn viên', 'Công tác chuyên môn nghiệp vụ',
      'Rèn luyện sức khoẻ', 'Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn', 'Tổng điểm', 'Xếp loại', 'Ghi chú'
    ]);

    let globalIndex = 1;

    departments.forEach(dept => {
      const deptMembers = members.filter(m => m.department_id === dept.id);
      if (deptMembers.length === 0) return;

      // Group header row
      rows.push([dept.name.toUpperCase()]);

      deptMembers.forEach((member) => {
        const ev = evaluations[member.id] || {};
        const hasEval = ev.id || ev.total_score !== undefined;
        const rank = hasEval ? getRank(ev.total_score) : { text: '', type: '' };
        rows.push([
          globalIndex++, member.full_name, member.title,
          hasEval ? (ev.score_1 || 0) : '',
          hasEval ? (ev.score_2 || 0) : '',
          hasEval ? (ev.score_3 || 0) : '',
          hasEval ? (ev.score_4 || 0) : '',
          hasEval ? (ev.score_5 || 0) : '',
          hasEval ? (ev.total_score || 0) : '',
          rank.text,
          ev.note || ''
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 15 },
      { wch: 38 }, { wch: 38 }, { wch: 30 }, { wch: 20 }, { wch: 45 },
      { wch: 10 }, { wch: 12 }, { wch: 35 }
    ];

    // Merging titles and group headers
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    ];

    // Find group rows to merge them across all columns
    let currentRow = 4; // Starts after header (rows 0, 1, 2, 3)
    departments.forEach(dept => {
      const deptMembers = members.filter(m => m.department_id === dept.id);
      if (deptMembers.length === 0) return;
      
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 10 } });
      currentRow += 1 + deptMembers.length; // 1 for header + members
    });
    
    ws['!merges'] = merges;

    // Bold styles could be applied if using a pro version of xlsx, or just rely on simple export

    XLSX.utils.book_append_sheet(wb, ws, 'Toàn Trung tâm');
    XLSX.writeFile(wb, `Chi_tiet_ToanTrungTam_T${currentMonth}.${currentYear}.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-800/50 rounded-full"></div>
            <div>
              <div className="w-48 h-8 bg-slate-800/50 rounded mb-1"></div>
              <div className="w-64 h-4 bg-slate-800/50 rounded"></div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-64 h-10 bg-slate-800/50 rounded-xl border border-slate-700/50"></div>
            <div className="w-32 h-10 bg-slate-800/50 rounded border border-slate-700/50"></div>
          </div>
        </div>

        <div className="glass-panel border border-slate-700/50" style={{ height: 'calc(100vh - 250px)' }}>
          <div className="h-10 bg-slate-900 border-b border-slate-700/50"></div>
          <div className="p-2 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-8 bg-slate-800/30 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  let globalIndex = 1;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Toàn bộ Trung tâm</h1>
            <p className="text-slate-400">Xem danh sách đánh giá của tất cả các chi đoàn</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
            <span className="text-sm text-slate-400">Năm:</span>
            <select 
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
              value={currentYear}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setCurrentYear(y);
                if (y === new Date().getFullYear() && currentMonth > new Date().getMonth() + 1) {
                  setCurrentMonth(new Date().getMonth() + 1);
                }
              }}
            >
              {Array.from({ length: new Date().getFullYear() - 2026 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-sm text-slate-400 ml-2">Tháng:</span>
            <select 
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
            >
              {Array.from({ length: currentYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          <button onClick={exportExcel} className="btn btn-primary flex items-center gap-2 text-sm">
            <FileDown size={18} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl flex flex-col" style={{ height: 'calc(100vh - 250px)' }}>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-md">
              <tr>
                <th className="table-th text-center w-10 border-r border-slate-700/50 text-xs p-1">STT</th>
                <th className="table-th w-32 border-r border-slate-700/50 text-xs p-1">Họ và tên</th>
                <th className="table-th w-24 border-r border-slate-700/50 text-xs p-1">Chức danh</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal w-16 p-1 bg-slate-800/30" title="Lý tưởng cách mạng, nhận thức chính trị">Lý tưởng<br/>nhận thức</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal w-16 p-1 bg-slate-800/30" title="Đạo đức, lối sống, tác phong đoàn viên">Đạo đức<br/>lối sống</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal w-16 p-1 bg-slate-800/30" title="Công tác chuyên môn nghiệp vụ">Chuyên môn<br/>nghiệp vụ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal w-16 p-1 bg-slate-800/30" title="Rèn luyện sức khoẻ">Rèn luyện<br/>sức khoẻ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal w-16 p-1 bg-slate-800/30" title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn">Ý thức<br/>phong trào</th>
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/10 text-blue-200 text-xs p-1">Tổng<br/>điểm</th>
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/10 text-blue-200 text-xs p-1">Xếp<br/>loại</th>
                <th className="table-th w-24 text-xs p-1">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center p-8 text-slate-400">
                    Chưa có phòng ban nào
                  </td>
                </tr>
              ) : (
                departments.map(dept => {
                  const deptMembers = members.filter(m => m.department_id === dept.id);
                  if (deptMembers.length === 0) return null;

                  return (
                    <Fragment key={dept.id}>
                      {/* Department Group Header */}
                      <tr className="bg-slate-800/80 border-y border-slate-700/50">
                        <td colSpan={11} className="p-2 font-bold text-blue-400 text-sm">
                          {dept.name.toUpperCase()}
                        </td>
                      </tr>
                      
                      {/* Department Members */}
                      {deptMembers.map((member) => {
                        const ev = evaluations[member.id] || {};
                        const hasEval = ev.id || ev.total_score !== undefined;
                        const total = ev.total_score || 0;
                        const rank = getRank(total);

                        return (
                          <tr key={member.id} className="hover:bg-slate-800/30 transition-colors border-b border-slate-800/50">
                            <td className="table-td text-center border-r border-slate-700/50 text-slate-400 p-1 text-xs">{globalIndex++}</td>
                            <td className="table-td font-medium border-r border-slate-700/50 text-white p-1 text-xs">{member.full_name}</td>
                            <td className="table-td text-slate-400 border-r border-slate-700/50 p-1 text-xs">{member.title}</td>
                            <td className="table-td text-center border-r border-slate-700/50 p-1 text-xs">{hasEval ? (ev.score_1 ?? 0) : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 p-1 text-xs">{hasEval ? (ev.score_2 ?? 0) : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 p-1 text-xs">{hasEval ? (ev.score_3 ?? 0) : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 p-1 text-xs">{hasEval ? (ev.score_4 ?? 0) : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 p-1 text-xs">{hasEval ? (ev.score_5 ?? 0) : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 font-bold text-xs bg-blue-500/5 p-1">{hasEval ? total : '-'}</td>
                            <td className="table-td text-center border-r border-slate-700/50 bg-blue-500/5 p-1">
                              <span className={`badge ${rank.class} text-[10px] px-1 py-0.5`}>{rank.text}</span>
                            </td>
                            <td className="table-td text-slate-400 text-xs p-1 truncate max-w-[100px]">{ev.note || ''}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
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

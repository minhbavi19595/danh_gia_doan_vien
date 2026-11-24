'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Filter, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function DepartmentDetail() {
  const params = useParams();
  const router = useRouter();
  const deptId = params.id as string;

  const [department, setDepartment] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [rankFilter, setRankFilter] = useState<string>('all');

  useEffect(() => {
    fetchDepartment();
  }, [deptId]);

  useEffect(() => {
    if (department) fetchData();
  }, [department, currentYear, currentMonth]);

  const fetchDepartment = async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('id', deptId)
      .single();
    if (data) setDepartment(data);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .eq('department_id', deptId)
        .order('created_at', { ascending: true });

      setMembers(membersData || []);

      if (membersData && membersData.length > 0) {
        const memberIds = membersData.map(m => m.id);
        const { data: evalsData } = await supabase
          .from('evaluations')
          .select('*')
          .in('member_id', memberIds)
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
    if (score == null || score <= 0) return { text: '-', class: '', type: '' };
    if (score >= 90) return { text: 'HTXSNV', class: 'badge-a', type: 'A' };
    if (score >= 70) return { text: 'HTTNV', class: 'badge-b', type: 'B' };
    if (score >= 50) return { text: 'HTNV', class: 'badge-c', type: 'C' };
    return { text: 'KHTNV', class: 'badge-d', type: 'D' };
  };

  const filteredMembers = members.filter(member => {
    if (rankFilter === 'all') return true;
    const ev = evaluations[member.id];
    const total = ev ? (ev.status === 'rejected' ? ev.bch_total_score : ev.total_score) : null;
    if (!ev || total == null || total <= 0) return rankFilter === 'none';
    const rank = getRank(total);
    return rank.type === rankFilter;
  });

  // Stats
  const stats = { A: 0, B: 0, C: 0, D: 0, total: 0 };
  members.forEach(m => {
    const ev = evaluations[m.id];
    const total = ev ? (ev.status === 'rejected' ? ev.bch_total_score : ev.total_score) : null;
    if (ev && total != null && total > 0) {
      stats.total++;
      const r = getRank(total);
      if (r.type === 'A') stats.A++;
      else if (r.type === 'B') stats.B++;
      else if (r.type === 'C') stats.C++;
      else if (r.type === 'D') stats.D++;
    }
  });

  const exportExcel = () => {
    if (!department) return;
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];
    
    rows.push(['BẢNG ĐÁNH GIÁ CHI TIẾT - ' + department.name.toUpperCase()]);
    rows.push([`Tháng ${currentMonth} năm ${currentYear}`]);
    rows.push([]);
    rows.push([
      'STT', 'Họ và tên', 'Chức danh',
      'Lý tưởng cách mạng, nhận thức chính trị', 'Đạo đức, lối sống, tác phong đoàn viên', 'Công tác chuyên môn nghiệp vụ',
      'Rèn luyện sức khoẻ', 'Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn', 'Tổng điểm', 'Xếp loại', 'Ghi chú'
    ]);

    filteredMembers.forEach((member, i) => {
      const ev = evaluations[member.id] || {};
      const hasEval = ev.id || ev.total_score !== undefined;
      const isRejected = ev.status === 'rejected';
      const s1 = isRejected ? ev.bch_score_1 : ev.score_1;
      const s2 = isRejected ? ev.bch_score_2 : ev.score_2;
      const s3 = isRejected ? ev.bch_score_3 : ev.score_3;
      const s4 = isRejected ? ev.bch_score_4 : ev.score_4;
      const s5 = isRejected ? ev.bch_score_5 : ev.score_5;
      const total = isRejected ? ev.bch_total_score : ev.total_score;
      const note = isRejected ? ev.bch_note : ev.note;
      
      const rank = hasEval && (total ?? 0) > 0 ? getRank(total) : { text: '', type: '' };
      const displayNote = !hasEval ? (note || 'Đoàn viên mới') : (note || '');
      rows.push([
        i + 1, member.full_name, member.title,
        hasEval ? (s1 || 0) : '',
        hasEval ? (s2 || 0) : '',
        hasEval ? (s3 || 0) : '',
        hasEval ? (s4 || 0) : '',
        hasEval ? (s5 || 0) : '',
        hasEval ? (total || 0) : '',
        rank.text,
        displayNote
      ]);
    });

    rows.push([]);
    rows.push([`Tổng: ${stats.total} đoàn viên | A: ${stats.A} | B: ${stats.B} | C: ${stats.C} | D: ${stats.D}`]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 15 },
      { wch: 38 }, { wch: 38 }, { wch: 30 }, { wch: 20 }, { wch: 45 },
      { wch: 10 }, { wch: 12 }, { wch: 35 }
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Chi tiết');
    XLSX.writeFile(wb, `Chi_tiet_${department.name}_T${currentMonth}.${currentYear}.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="w-24 h-4 bg-slate-800/50 rounded mb-3"></div>
            <div className="w-64 h-8 bg-slate-800/50 rounded mb-1"></div>
            <div className="flex gap-3 mt-2">
              <div className="w-32 h-8 bg-slate-800/50 rounded-lg"></div>
              <div className="w-32 h-8 bg-slate-800/50 rounded-lg"></div>
            </div>
          </div>
          <div className="w-32 h-10 bg-slate-800/50 rounded-xl border border-slate-700/50"></div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel p-4 h-20 border border-slate-700/50"></div>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <div className="w-16 h-4 bg-slate-800/50 rounded mr-2"></div>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="w-20 h-6 bg-slate-800/50 rounded-full border border-slate-700/30"></div>
          ))}
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button 
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-3 text-sm"
          >
            <ArrowLeft size={16} />
            Quay lại Dashboard
          </button>
          <h1 className="text-2xl font-bold mb-1">
            {department?.name || 'Đang tải...'}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-400">Năm:</span>
            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              value={currentYear}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setCurrentYear(y);
                if (y === new Date().getFullYear() && currentMonth > new Date().getMonth() + 1) {
                  setCurrentMonth(new Date().getMonth() + 1);
                }
              }}
            >
              {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-slate-400">Tháng:</span>
            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
            >
              {Array.from({ length: currentYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={exportExcel}>
          <FileDown size={18} />
          Xuất Excel
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setRankFilter(rankFilter === 'A' ? 'all' : 'A')} className={`glass-panel p-4 text-center transition-all hover:-translate-y-0.5 cursor-pointer ${rankFilter === 'A' ? 'ring-2 ring-emerald-500' : ''}`}>
          <div className="text-2xl font-bold text-emerald-400">{stats.A}</div>
          <div className="text-xs text-slate-400 mt-1">Loại A (HTXSNV)</div>
        </button>
        <button onClick={() => setRankFilter(rankFilter === 'B' ? 'all' : 'B')} className={`glass-panel p-4 text-center transition-all hover:-translate-y-0.5 cursor-pointer ${rankFilter === 'B' ? 'ring-2 ring-blue-500' : ''}`}>
          <div className="text-2xl font-bold text-blue-400">{stats.B}</div>
          <div className="text-xs text-slate-400 mt-1">Loại B (HTTNV)</div>
        </button>
        <button onClick={() => setRankFilter(rankFilter === 'C' ? 'all' : 'C')} className={`glass-panel p-4 text-center transition-all hover:-translate-y-0.5 cursor-pointer ${rankFilter === 'C' ? 'ring-2 ring-amber-500' : ''}`}>
          <div className="text-2xl font-bold text-amber-400">{stats.C}</div>
          <div className="text-xs text-slate-400 mt-1">Loại C (HTNV)</div>
        </button>
        <button onClick={() => setRankFilter(rankFilter === 'D' ? 'all' : 'D')} className={`glass-panel p-4 text-center transition-all hover:-translate-y-0.5 cursor-pointer ${rankFilter === 'D' ? 'ring-2 ring-red-500' : ''}`}>
          <div className="text-2xl font-bold text-red-400">{stats.D}</div>
          <div className="text-xs text-slate-400 mt-1">Loại D (KHTNV)</div>
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Filter size={16} className="text-slate-400" />
        <span className="text-sm text-slate-400">Lọc xếp loại:</span>
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Tất cả', color: 'bg-slate-700 text-white' },
            { value: 'A', label: 'Loại A', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
            { value: 'B', label: 'Loại B', color: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
            { value: 'C', label: 'Loại C', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
            { value: 'D', label: 'Loại D', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
            { value: 'none', label: 'Chưa chấm', color: 'bg-slate-600/30 text-slate-400 border border-slate-600/30' },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setRankFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                rankFilter === f.value 
                  ? f.color + ' ring-2 ring-white/20 scale-105' 
                  : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {rankFilter !== 'all' && (
          <span className="text-xs text-slate-500">({filteredMembers.length} kết quả)</span>
        )}
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
              {loading ? (
                <tr><td colSpan={11} className="text-center p-12 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={11} className="text-center p-12 text-slate-400">
                  {rankFilter !== 'all' ? 'Không có đoàn viên nào phù hợp bộ lọc' : 'Chưa có đoàn viên nào'}
                </td></tr>
              ) : (
                filteredMembers.map((member, index) => {
                  const ev = evaluations[member.id] || {};
                  const hasEval = ev.id || ev.total_score !== undefined;
                  const isRejected = ev.status === 'rejected';
                  
                  const s1 = isRejected ? ev.bch_score_1 : ev.score_1;
                  const s2 = isRejected ? ev.bch_score_2 : ev.score_2;
                  const s3 = isRejected ? ev.bch_score_3 : ev.score_3;
                  const s4 = isRejected ? ev.bch_score_4 : ev.score_4;
                  const s5 = isRejected ? ev.bch_score_5 : ev.score_5;
                  const total = isRejected ? ev.bch_total_score : ev.total_score;
                  const note = isRejected ? ev.bch_note : ev.note;
                  
                  const rank = hasEval ? getRank(total) : { text: '-', class: '', type: '' };

                  return (
                    <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="table-td text-center border-r border-slate-700/50 text-slate-400 p-1 text-xs">{index + 1}</td>
                      <td className="table-td font-medium border-r border-slate-700/50 text-white p-1 text-xs">{member.full_name}</td>
                      <td className="table-td text-slate-400 border-r border-slate-700/50 p-1 text-xs">{member.title}</td>
                      
                      {[
                        { val: s1, old: ev.score_1 },
                        { val: s2, old: ev.score_2 },
                        { val: s3, old: ev.score_3 },
                        { val: s4, old: ev.score_4 },
                        { val: s5, old: ev.score_5 }
                      ].map((col, idx) => (
                        <td key={idx} className="table-td text-center border-r border-slate-700/50 p-1 text-xs relative">
                          {hasEval ? (col.val ?? '-') : '-'}
                          {isRejected && col.val !== col.old && (
                            <span className="absolute top-0 right-1 text-[12px] text-slate-500 line-through" title="Điểm chi đoàn chấm">{col.old}</span>
                          )}
                        </td>
                      ))}
                      
                      <td className="table-td text-center border-r border-slate-700/50 font-bold text-xs bg-blue-500/5 p-1 relative">
                        {hasEval ? total : '-'}
                        {isRejected && total !== ev.total_score && (
                          <span className="absolute top-0 right-1 text-[12px] text-slate-500 line-through" title="Điểm chi đoàn chấm">{ev.total_score}</span>
                        )}
                      </td>
                      <td className="table-td text-center border-r border-slate-700/50 bg-blue-500/5 p-1">
                        <span className={`badge ${rank.class} text-[10px] px-1 py-0.5`}>{rank.text}</span>
                      </td>
                      <td className="table-td text-slate-400 text-xs p-1 truncate max-w-[100px]">{!hasEval ? (note || 'Đoàn viên mới') : (note || '')}</td>
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

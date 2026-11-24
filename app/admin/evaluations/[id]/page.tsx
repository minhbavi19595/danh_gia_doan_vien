'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Filter, FileDown, Trash2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import XLSX from 'xlsx-js-style';
import { sortMembersByTitle } from '@/lib/sortMembers';
import { getMaxEvaluationPeriod, getAvailableYears, getAvailableMonths } from '@/lib/evaluationPeriod';
import CustomSelect from '@/components/CustomSelect';

export default function DepartmentDetail() {
  const params = useParams();
  const router = useRouter();
  const deptId = params.id as string;

  const [department, setDepartment] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const { maxYear, maxMonth } = getMaxEvaluationPeriod();
  const [currentYear, setCurrentYear] = useState(maxYear);
  const [currentMonth, setCurrentMonth] = useState(maxMonth);
  const [rankFilter, setRankFilter] = useState<string>('all');
  const toast = useToast();

  const handleDeleteMember = async (member: any) => {
    const confirmed = await toast.confirm(
      `Bạn có chắc chắn muốn xóa đoàn viên "${member.full_name}"?\nToàn bộ lịch sử điểm đánh giá của đoàn viên này cũng sẽ bị xóa vĩnh viễn.`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('members').delete().eq('id', member.id);
      if (error) throw error;
      toast.success(`Đã xóa đoàn viên "${member.full_name}"`);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa đoàn viên: ' + (err.message || 'Không xác định'));
    }
  };

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

      setMembers(sortMembersByTitle(membersData || []));

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
    const merges: any[] = [];
    const rowHeights: any[] = [];

    const emptyRow = () => Array(13).fill('');
    const thinBorder = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
    const baseFont = { name: 'Times New Roman', sz: 12 };
    const deptTitle = (department.name || 'CHI ĐOÀN').toUpperCase();

    // Row 0-1: blank spacing
    rows.push(emptyRow());
    rowHeights.push({ hpt: 10 });
    rows.push(emptyRow());
    rowHeights.push({ hpt: 10 });

    // Row 2: Tổ chức cấp trên & Quốc hiệu Đoàn
    const r2 = emptyRow();
    r2[0] = 'ĐOÀN XÃ QUẢNG OAI';
    r2[7] = 'ĐOÀN TNCS HỒ CHÍ MINH';
    rows.push(r2);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 6 } });
    merges.push({ s: { r: 2, c: 7 }, e: { r: 2, c: 12 } });

    // Row 3: Đơn vị & Tên Chi đoàn
    const r3 = emptyRow();
    r3[0] = `ĐOÀN THANH NIÊN TRUNG TÂM CHĂM SÓC VÀ PHỤC HỒI CHỨC NĂNG NGƯỜI TÂM THẦN SỐ 1\n${deptTitle}\n***`;
    rows.push(r3);
    rowHeights.push({ hpt: 64 });
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 6 } });

    // Row 4-6: Tiêu đề báo cáo
    const r4 = emptyRow();
    r4[0] = `DANH SÁCH TỔNG HỢP - ${deptTitle}`;
    rows.push(r4);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 12 } });

    const r5 = emptyRow();
    r5[0] = 'KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI ĐOÀN VIÊN';
    rows.push(r5);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 12 } });

    const r6 = emptyRow();
    r6[0] = `Tháng ${currentMonth} năm ${currentYear}\n------`;
    rows.push(r6);
    rowHeights.push({ hpt: 34 });
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 12 } });

    // Row 7: blank
    rows.push(emptyRow());
    rowHeights.push({ hpt: 10 });

    // Row 8-9: Header 2 dòng
    rows.push([
      'STT',
      'Họ và tên',
      'Chức danh',
      'Lý tưởng cách mạng, nhận thức chính trị',
      'Đạo đức, lối sống, tác phong đoàn viên',
      'Công tác chuyên môn nghiệp vụ',
      'Rèn luyện sức khoẻ',
      'Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn',
      'Chi đoàn\nđánh giá',
      '',
      'BCH Đoàn Trung tâm đánh giá',
      '',
      'Ghi chú',
    ]);
    rowHeights.push({ hpt: 36 });

    rows.push([
      '', '', '', '', '', '', '', '',
      'Tổng điểm',
      'Mức xếp loại',
      'Tổng điểm',
      'Mức xếp loại',
      '',
    ]);
    rowHeights.push({ hpt: 62 });

    for (let c = 0; c <= 7; c++) {
      merges.push({ s: { r: 8, c }, e: { r: 9, c } });
    }
    merges.push({ s: { r: 8, c: 8 }, e: { r: 8, c: 9 } });
    merges.push({ s: { r: 8, c: 10 }, e: { r: 8, c: 11 } });
    merges.push({ s: { r: 8, c: 12 }, e: { r: 9, c: 12 } });

    // Row 10: Tên chi đoàn
    const deptRowIdx = rows.length;
    const deptRow = emptyRow();
    deptRow[0] = deptTitle;
    rows.push(deptRow);
    rowHeights.push({ hpt: 26 });
    merges.push({ s: { r: deptRowIdx, c: 0 }, e: { r: deptRowIdx, c: 12 } });

    // Dòng dữ liệu đoàn viên
    const dataRowIndices: number[] = [];
    let countA = 0, countB = 0, countC = 0, countD = 0;

    filteredMembers.forEach((member, i) => {
      const ev = evaluations[member.id] || {};
      const hasEval = Boolean(ev.id || ev.total_score !== undefined);
      const isRejected = ev.status === 'rejected';
      const isApproved = ev.status === 'approved';

      const cdTotal = hasEval ? (ev.total_score ?? '') : '';
      const cdRank = hasEval && (ev.total_score ?? 0) > 0 ? getRank(ev.total_score).text : '';

      const bchScore = isRejected ? ev.bch_total_score : isApproved ? ev.total_score : null;
      const bchTotal = hasEval && bchScore != null ? bchScore : '';
      const bchRank = hasEval && bchScore != null && bchScore > 0 ? getRank(bchScore).text : '';

      const finalScore = isRejected ? ev.bch_total_score : ev.total_score;
      if (hasEval && finalScore != null && finalScore > 0) {
        if (finalScore >= 90) countA++;
        else if (finalScore >= 70) countB++;
        else if (finalScore >= 50) countC++;
        else countD++;
      }

      const rawNote = isRejected ? (ev.bch_note || ev.note || '') : (ev.note || '');
      const note = !hasEval ? (rawNote || 'Đoàn viên mới') : rawNote;
      const rowIdx = rows.length;
      dataRowIndices.push(rowIdx);

      const noteLines = Math.max(1, Math.ceil(String(note).length / 26));
      const nameLines = Math.max(1, Math.ceil(String(member.full_name || '').length / 22));
      const maxLines = Math.max(noteLines, nameLines);
      rowHeights.push({ hpt: Math.max(24, maxLines * 16 + 8) });

      rows.push([
        i + 1,
        member.full_name,
        member.title,
        hasEval ? (ev.score_1 ?? '') : '',
        hasEval ? (ev.score_2 ?? '') : '',
        hasEval ? (ev.score_3 ?? '') : '',
        hasEval ? (ev.score_4 ?? '') : '',
        hasEval ? (ev.score_5 ?? '') : '',
        cdTotal,
        cdRank,
        bchTotal,
        bchRank,
        note,
      ]);
    });

    // Dòng tổng kết
    const summaryIdx = rows.length;
    const summaryRow = emptyRow();
    summaryRow[0] = `Tổng số: ${filteredMembers.length} đoàn viên. Trong đó: Xếp loại A: ${countA}; Xếp loại B: ${countB}; Xếp loại C: ${countC}; Xếp loại D: ${countD}`;
    rows.push(summaryRow);
    rowHeights.push({ hpt: 24 });
    merges.push({ s: { r: summaryIdx, c: 0 }, e: { r: summaryIdx, c: 12 } });

    // Chân trang: Nơi nhận & Chữ ký
    const today = new Date();
    const dateIdx = rows.length;
    const dateRow = emptyRow();
    dateRow[9] = `Hà Nội, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
    rows.push(dateRow);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: dateIdx, c: 9 }, e: { r: dateIdx, c: 12 } });

    rows.push(emptyRow());
    rowHeights.push({ hpt: 12 });

    const signHeaderIdx = rows.length;
    const signHeaderRow = emptyRow();
    signHeaderRow[0] = 'Nơi nhận';
    signHeaderRow[9] = 'TM. BCH CHI ĐOÀN';
    rows.push(signHeaderRow);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: signHeaderIdx, c: 9 }, e: { r: signHeaderIdx, c: 12 } });

    const signRoleIdx = rows.length;
    const signRoleRow = emptyRow();
    signRoleRow[0] = 'BCH Đoàn TT (để báo cáo);';
    signRoleRow[9] = 'BÍ THƯ';
    rows.push(signRoleRow);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: signRoleIdx, c: 0 }, e: { r: signRoleIdx, c: 8 } });
    merges.push({ s: { r: signRoleIdx, c: 9 }, e: { r: signRoleIdx, c: 12 } });

    const saveIdx = rows.length;
    const saveRow = emptyRow();
    saveRow[0] = 'Lưu: Chi đoàn./.';
    rows.push(saveRow);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: saveIdx, c: 0 }, e: { r: saveIdx, c: 8 } });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!rows'] = rowHeights;
    ws['!cols'] = [
      { wch: 5 },
      { wch: 24 },
      { wch: 13 },
      { wch: 11 },
      { wch: 11 },
      { wch: 11 },
      { wch: 9 },
      { wch: 13 },
      { wch: 11 },
      { wch: 13 },
      { wch: 11 },
      { wch: 13 },
      { wch: 30 },
    ];

    const setStyle = (r: number, c: number, style: any) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    // Style tiêu đề đầu trang
    setStyle(2, 0, {
      font: { ...baseFont, sz: 13 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(2, 7, {
      font: { ...baseFont, sz: 13, bold: true, underline: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(3, 0, {
      font: { ...baseFont, sz: 13, bold: true },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });
    setStyle(4, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(5, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(6, 0, {
      font: { ...baseFont, sz: 13, bold: true },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    });

    // Style header bảng (row 8 & 9)
    for (let r = 8; r <= 9; r++) {
      for (let c = 0; c <= 12; c++) {
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: true },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: thinBorder,
        });
      }
    }

    // Style dòng tên Chi đoàn
    for (let c = 0; c <= 12; c++) {
      setStyle(deptRowIdx, c, {
        font: { ...baseFont, sz: 11, bold: true },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: thinBorder,
      });
    }

    // Style dòng dữ liệu đoàn viên
    dataRowIndices.forEach((r) => {
      for (let c = 0; c <= 12; c++) {
        const isBoldCol = c === 8 || c === 10;
        const isLeftCol = c === 1 || c === 12;
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: isBoldCol },
          alignment: {
            horizontal: isLeftCol ? 'left' : 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: thinBorder,
        });
      }
    });

    // Style dòng tổng hợp & chân trang
    setStyle(summaryIdx, 0, {
      font: { ...baseFont, sz: 11, bold: true, italic: true },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    setStyle(dateIdx, 9, {
      font: { ...baseFont, sz: 11, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(signHeaderIdx, 0, {
      font: { ...baseFont, sz: 11, bold: true, italic: true },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    setStyle(signHeaderIdx, 9, {
      font: { ...baseFont, sz: 11, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(signRoleIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    setStyle(signRoleIdx, 9, {
      font: { ...baseFont, sz: 11, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(saveIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' },
    });

    XLSX.utils.book_append_sheet(wb, ws, 'mẫu phòng');
    XLSX.writeFile(wb, `Đánh giá đoàn viên ${department.name} - T${currentMonth}.${currentYear}.xlsx`);
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
            <span className="text-slate-400 text-sm">Năm:</span>
            <CustomSelect
              size="sm"
              value={currentYear}
              onChange={(val) => {
                const y = parseInt(val);
                setCurrentYear(y);
                if (y === maxYear && currentMonth > maxMonth) {
                  setCurrentMonth(maxMonth);
                }
              }}
              options={getAvailableYears(2024).map((y) => ({ value: y, label: String(y) }))}
            />
            <span className="text-slate-400 text-sm">Tháng:</span>
            <CustomSelect
              size="sm"
              value={currentMonth}
              onChange={(val) => setCurrentMonth(parseInt(val))}
              options={getAvailableMonths(currentYear).map((m) => ({ value: m, label: `Tháng ${m}` }))}
            />
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
                <th className="table-th w-24 border-r border-slate-700/50 text-xs p-1">Ghi chú</th>
                <th className="table-th text-center w-12 text-xs p-1">Xóa</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center p-12 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={12} className="text-center p-12 text-slate-400">
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
                      <td className="table-td text-slate-400 border-r border-slate-700/50 text-xs p-1 truncate max-w-[100px]">{!hasEval ? (note || 'Đoàn viên mới') : (note || '')}</td>
                      <td className="table-td text-center p-1">
                        <button
                          className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Xóa đoàn viên"
                          onClick={() => handleDeleteMember(member)}
                        >
                          <Trash2 size={14} />
                        </button>
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

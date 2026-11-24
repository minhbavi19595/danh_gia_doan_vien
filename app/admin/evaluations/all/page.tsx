'use client';

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileDown, Trash2, Search } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import XLSX from 'xlsx-js-style';
import { sortMembersByTitle } from '@/lib/sortMembers';
import { getMaxEvaluationPeriod, getAvailableYears, getAvailableMonths } from '@/lib/evaluationPeriod';

export default function AllDepartmentsDetail() {
  const router = useRouter();

  const [departments, setDepartments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const { maxYear, maxMonth } = getMaxEvaluationPeriod();
  const [currentYear, setCurrentYear] = useState(maxYear);
  const [currentMonth, setCurrentMonth] = useState(maxMonth);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const toast = useToast();

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

      setMembers(sortMembersByTitle(membersData || []));

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

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

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

  const getRank = (score: number | null | undefined) => {
    if (score == null || score <= 0) return { text: '-', class: '', type: '' };
    if (score >= 90) return { text: 'HTXSNV', class: 'badge-a', type: 'A' };
    if (score >= 70) return { text: 'HTTNV', class: 'badge-b', type: 'B' };
    if (score >= 50) return { text: 'HTNV', class: 'badge-c', type: 'C' };
    return { text: 'KHTNV', class: 'badge-d', type: 'D' };
  };

  const exportExcel = () => {
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

    // Row 3: Đơn vị
    const r3 = emptyRow();
    r3[0] = 'ĐOÀN THANH NIÊN TRUNG TÂM CHĂM SÓC VÀ PHỤC HỒI CHỨC NĂNG NGƯỜI TÂM THẦN SỐ 1\n***';
    rows.push(r3);
    rowHeights.push({ hpt: 52 });
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 6 } });

    // Row 4-6: Tiêu đề báo cáo
    const r4 = emptyRow();
    r4[0] = 'DANH SÁCH TỔNG HỢP';
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

    const deptRowIndices: number[] = [];
    const dataRowIndices: number[] = [];
    let globalIndex = 1;
    let totalMembers = 0;
    const rankCounts = { A: 0, B: 0, C: 0, D: 0 };

    departments.forEach((dept) => {
      const deptMembers = members.filter((m) => m.department_id === dept.id);
      if (deptMembers.length === 0) return;

      const deptRowIdx = rows.length;
      const deptRow = emptyRow();
      deptRow[0] = dept.name.toUpperCase();
      rows.push(deptRow);
      rowHeights.push({ hpt: 26 });
      deptRowIndices.push(deptRowIdx);
      merges.push({ s: { r: deptRowIdx, c: 0 }, e: { r: deptRowIdx, c: 12 } });

      deptMembers.forEach((member) => {
        totalMembers++;
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
          const finalType = getRank(finalScore).type as keyof typeof rankCounts;
          if (finalType && finalType in rankCounts) {
            rankCounts[finalType]++;
          }
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
          globalIndex++,
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
    });

    // Dòng tổng kết
    const summaryIdx = rows.length;
    const summaryRow = emptyRow();
    summaryRow[0] = `Tổng số: ${totalMembers} đoàn viên. Trong đó: Xếp loại A: ${rankCounts.A}; Xếp loại B: ${rankCounts.B}; Xếp loại C: ${rankCounts.C}; Xếp loại D: ${rankCounts.D}`;
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
    signHeaderRow[9] = 'TM. BCH ĐOÀN';
    rows.push(signHeaderRow);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: signHeaderIdx, c: 9 }, e: { r: signHeaderIdx, c: 12 } });

    const signRoleIdx = rows.length;
    const signRoleRow = emptyRow();
    signRoleRow[0] = 'Đảng uỷ (để báo cáo);';
    signRoleRow[9] = 'BÍ THƯ';
    rows.push(signRoleRow);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: signRoleIdx, c: 0 }, e: { r: signRoleIdx, c: 8 } });
    merges.push({ s: { r: signRoleIdx, c: 9 }, e: { r: signRoleIdx, c: 12 } });

    const ccIdx = rows.length;
    const ccRow = emptyRow();
    ccRow[0] = 'Các chi đoàn;';
    rows.push(ccRow);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: ccIdx, c: 0 }, e: { r: ccIdx, c: 1 } });

    const saveIdx = rows.length;
    const saveRow = emptyRow();
    saveRow[0] = 'Lưu: VP đoàn./.';
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
    deptRowIndices.forEach((r) => {
      for (let c = 0; c <= 12; c++) {
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: true },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: thinBorder,
        });
      }
    });

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
    setStyle(ccIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    setStyle(saveIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' },
    });

    XLSX.utils.book_append_sheet(wb, ws, 'mẫu phòng');
    XLSX.writeFile(wb, `Danh_gia_doan_vien_thang_${currentMonth}_${currentYear}.xlsx`);
  };

  const filteredDepartments = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return departments
      .filter((d) => deptFilter === 'all' || d.id === deptFilter)
      .map((dept) => {
        const deptMembers = members.filter(
          (m) =>
            m.department_id === dept.id &&
            (!keyword || m.full_name?.toLowerCase().includes(keyword))
        );
        return { ...dept, members: deptMembers };
      })
      .filter((d) => d.members.length > 0);
  }, [departments, members, deptFilter, searchTerm]);

  const stats = useMemo(() => {
    const res = { total: 0, evaluated: 0, A: 0, B: 0, C: 0, D: 0 };
    filteredDepartments.forEach((dept) => {
      dept.members.forEach((m: any) => {
        res.total++;
        const ev = evaluations[m.id];
        if (!ev) return;
        const isRejected = ev.status === 'rejected';
        const score = isRejected ? ev.bch_total_score : ev.total_score;
        if (typeof score === 'number' && score > 0) {
          res.evaluated++;
          const r = getRank(score);
          if (r.type === 'A') res.A++;
          else if (r.type === 'B') res.B++;
          else if (r.type === 'C') res.C++;
          else if (r.type === 'D') res.D++;
        }
      });
    });
    return res;
  }, [filteredDepartments, evaluations]);

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
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      {/* Compact Header + Filters + Inline Stats */}
      <div className="flex flex-col gap-2 bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800 shadow-lg shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push('/admin')}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white shrink-0"
              title="Quay lại Dashboard"
            >
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-blue-400 whitespace-nowrap">
              Chi tiết toàn Trung tâm
            </h1>
            <span className="hidden xl:inline text-xs text-slate-400 whitespace-nowrap">
              (Tháng {currentMonth}/{currentYear})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500"
              value={currentYear}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setCurrentYear(y);
                if (y === maxYear && currentMonth > maxMonth) {
                  setCurrentMonth(maxMonth);
                }
              }}
            >
              {getAvailableYears(2024).map((y) => (
                <option key={y} value={y}>
                  Năm {y}
                </option>
              ))}
            </select>

            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
            >
              {getAvailableMonths(currentYear).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>

            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-medium max-w-[190px] focus:outline-none focus:border-blue-500"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="all">Tất cả chi đoàn</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm đoàn viên..."
                className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-7 pr-2 py-1 w-36 sm:w-40 text-xs focus:outline-none focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <button
              onClick={exportExcel}
              className="btn btn-secondary py-1 px-2.5 text-xs"
            >
              <FileDown size={14} />
              Xuất Excel
            </button>
          </div>
        </div>

        {/* Compact Stats Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-800/80 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
            Tổng: <strong className="text-white">{stats.total}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20">
            Đã chấm: <strong>{stats.evaluated}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            HTXSNV (A): <strong>{stats.A}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20">
            HTTNV (B): <strong>{stats.B}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
            HTNV (C): <strong>{stats.C}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
            KHTNV (D): <strong>{stats.D}</strong>
          </span>
        </div>
      </div>

      {/* Table - tự co giãn vừa khít màn hình, ghim header & 3 cột đầu */}
      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl w-full flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-30 bg-slate-900">
              <tr>
                <th className="sticky left-0 z-40 bg-slate-900 table-th text-center w-[42px] min-w-[42px] border-r border-b border-slate-700/80 text-[11px] px-1 py-2">
                  STT
                </th>
                <th className="sticky left-[42px] z-40 bg-slate-900 table-th w-[190px] min-w-[190px] border-r border-b border-slate-700/80 text-[11px] px-2.5 py-2">
                  Họ và tên
                </th>
                <th className="sticky left-[232px] z-40 bg-slate-900 table-th w-[155px] min-w-[155px] border-r-2 border-b border-slate-600 text-[11px] px-2.5 py-2 shadow-[2px_0_6px_rgba(0,0,0,0.4)]">
                  Chức danh
                </th>
                <th
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] leading-tight whitespace-normal min-w-[76px] px-1.5 py-2"
                  title="Lý tưởng cách mạng, nhận thức chính trị"
                >
                  Lý tưởng<br />nhận thức
                </th>
                <th
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] leading-tight whitespace-normal min-w-[76px] px-1.5 py-2"
                  title="Đạo đức, lối sống, tác phong đoàn viên"
                >
                  Đạo đức<br />lối sống
                </th>
                <th
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] leading-tight whitespace-normal min-w-[78px] px-1.5 py-2"
                  title="Công tác chuyên môn nghiệp vụ"
                >
                  Chuyên môn<br />nghiệp vụ
                </th>
                <th
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] leading-tight whitespace-normal min-w-[72px] px-1.5 py-2"
                  title="Rèn luyện sức khoẻ"
                >
                  Rèn luyện<br />sức khoẻ
                </th>
                <th
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] leading-tight whitespace-normal min-w-[76px] px-1.5 py-2"
                  title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn"
                >
                  Ý thức<br />phong trào
                </th>
                <th className="bg-slate-900 table-th text-center border-r border-b border-slate-700/80 text-blue-300 text-[11px] min-w-[68px] px-1.5 py-2">
                  Tổng điểm
                </th>
                <th className="bg-slate-900 table-th text-center border-r border-b border-slate-700/80 text-blue-300 text-[11px] min-w-[78px] px-1.5 py-2">
                  Xếp loại
                </th>
                <th className="bg-slate-900 table-th border-r border-b border-slate-700/80 text-[11px] min-w-[160px] px-2.5 py-2">
                  Ghi chú
                </th>
                <th className="bg-slate-900 table-th text-center border-b border-slate-700/80 text-[11px] w-[44px] min-w-[44px] px-1 py-2">
                  Xóa
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-slate-400">
                    Chưa có dữ liệu đoàn viên phù hợp.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((dept) => (
                  <Fragment key={dept.id}>
                    <tr className="bg-slate-800">
                      <td
                        colSpan={12}
                        className="px-3 py-2 font-bold text-blue-300 text-xs uppercase tracking-wide border-b border-slate-700/80 bg-slate-800"
                      >
                        <span className="sticky left-3 inline-block">{dept.name}</span>
                      </td>
                    </tr>

                    {dept.members.map((member: any) => {
                      const ev = evaluations[member.id] || {};
                      const hasEval = Boolean(ev.id || ev.total_score !== undefined);
                      const isRejected = ev.status === 'rejected';
                      const s1 = isRejected ? ev.bch_score_1 : ev.score_1;
                      const s2 = isRejected ? ev.bch_score_2 : ev.score_2;
                      const s3 = isRejected ? ev.bch_score_3 : ev.score_3;
                      const s4 = isRejected ? ev.bch_score_4 : ev.score_4;
                      const s5 = isRejected ? ev.bch_score_5 : ev.score_5;
                      const total = isRejected ? (ev.bch_total_score ?? 0) : (ev.total_score ?? 0);
                      const rank = hasEval ? getRank(total) : { text: '-', class: '', type: '' };
                      const rawNote = isRejected ? (ev.bch_note || ev.note || '') : (ev.note || '');
                      const displayNote = !hasEval ? (rawNote || 'Đoàn viên mới') : rawNote;

                      return (
                        <tr key={member.id} className="group hover:bg-slate-800/40 transition-colors">
                          <td className="sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800 table-td text-center text-xs text-slate-400 border-r border-b border-slate-800 px-1 py-2 w-[42px] min-w-[42px]">
                            {globalIndex++}
                          </td>
                          <td className="sticky left-[42px] z-20 bg-slate-900 group-hover:bg-slate-800 table-td font-medium text-xs sm:text-sm text-white border-r border-b border-slate-800 px-2.5 py-2 w-[190px] min-w-[190px] whitespace-normal break-words leading-snug">
                            {member.full_name}
                          </td>
                          <td className="sticky left-[232px] z-20 bg-slate-900 group-hover:bg-slate-800 table-td text-xs text-slate-300 border-r-2 border-b border-slate-700 px-2.5 py-2 w-[155px] min-w-[155px] whitespace-normal break-words leading-snug shadow-[2px_0_6px_rgba(0,0,0,0.35)]">
                            {member.title}
                          </td>
                          {[s1, s2, s3, s4, s5].map((score, idx) => (
                            <td
                              key={idx}
                              className={`table-td text-center text-xs border-r border-b border-slate-800 px-1 py-2 ${
                                isRejected ? 'text-amber-300 font-semibold' : 'text-slate-200'
                              }`}
                            >
                              {hasEval ? (score ?? 0) : <span className="text-slate-600">-</span>}
                            </td>
                          ))}
                          <td
                            className={`table-td text-center font-bold text-xs border-r border-b border-slate-800 px-1 py-2 whitespace-nowrap ${
                              isRejected ? 'text-amber-300' : 'text-blue-300'
                            }`}
                          >
                            {hasEval ? total : <span className="text-slate-600">-</span>}
                          </td>
                          <td className="table-td text-center border-r border-b border-slate-800 px-1 py-2 whitespace-nowrap">
                            {hasEval && total > 0 ? (
                              <span className={`badge ${rank.class} text-[10px] px-1.5 py-0.5`}>
                                {rank.text}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">-</span>
                            )}
                          </td>
                          <td className="table-td text-slate-300 border-r border-b border-slate-800 text-xs px-2.5 py-2 whitespace-normal break-words leading-snug">
                            {displayNote}
                          </td>
                          <td className="table-td text-center border-b border-slate-800 px-1 py-2">
                            <button
                              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Xóa đoàn viên"
                              onClick={() => handleDeleteMember(member)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

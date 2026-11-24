'use client';

import React, { useState, useEffect, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileDown } from 'lucide-react';
import XLSX from 'xlsx-js-style';

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
              {Array.from({ length: new Date().getFullYear() - 2024 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
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
                            <td className="table-td text-slate-400 text-xs p-1 truncate max-w-[100px]">{!hasEval ? (ev.note || 'Đoàn viên mới') : (ev.note || '')}</td>
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

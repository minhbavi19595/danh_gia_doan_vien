'use client';

import React, { useState, useEffect, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Check, X, CheckCircle2, XCircle, FileDown, Save, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import XLSX from 'xlsx-js-style';
import { sortMembersByTitle } from '@/lib/sortMembers';
import { getMaxEvaluationPeriod, getAvailableYears, getAvailableMonths } from '@/lib/evaluationPeriod';

export default function ApprovalsPage() {
  const router = useRouter();
  const toast = useToast();

  const [departments, setDepartments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const { maxYear, maxMonth } = getMaxEvaluationPeriod();
  const [currentYear, setCurrentYear] = useState(maxYear);
  const [currentMonth, setCurrentMonth] = useState(maxMonth);

  // Inline edit state for rejecting
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rejectForm, setRejectForm] = useState({
    bch_score_1: 0, bch_score_2: 0, bch_score_3: 0, bch_score_4: 0, bch_score_5: 0, bch_note: ''
  });

  useEffect(() => {
    fetchData();
  }, [currentYear, currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    setEditingId(null);
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
      toast.error('Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (evalId: string) => {
    try {
      const { error } = await supabase
        .from('evaluations')
        .update({ status: 'approved' })
        .eq('id', evalId);
        
      if (error) throw error;
      toast.success('Đã duyệt báo cáo');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi khi duyệt: ' + err.message);
    }
  };

  const startReject = (ev: any, memberId: string) => {
    setEditingId(memberId);
    setRejectForm({
      bch_score_1: ev.status === 'rejected' ? (ev.bch_score_1 || 0) : (ev.score_1 || 0),
      bch_score_2: ev.status === 'rejected' ? (ev.bch_score_2 || 0) : (ev.score_2 || 0),
      bch_score_3: ev.status === 'rejected' ? (ev.bch_score_3 || 0) : (ev.score_3 || 0),
      bch_score_4: ev.status === 'rejected' ? (ev.bch_score_4 || 0) : (ev.score_4 || 0),
      bch_score_5: ev.status === 'rejected' ? (ev.bch_score_5 || 0) : (ev.score_5 || 0),
      bch_note: ev.status === 'rejected' ? (ev.bch_note || '') : (ev.note || '')
    });
  };

  const handleSaveReject = async (evalId: string) => {
    try {
      const { error } = await supabase
        .from('evaluations')
        .update({
          status: 'rejected',
          bch_score_1: rejectForm.bch_score_1,
          bch_score_2: rejectForm.bch_score_2,
          bch_score_3: rejectForm.bch_score_3,
          bch_score_4: rejectForm.bch_score_4,
          bch_score_5: rejectForm.bch_score_5,
          bch_note: rejectForm.bch_note
        })
        .eq('id', evalId);

      if (error) throw error;
      toast.success('Đã lưu điểm không duyệt');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi khi lưu: ' + err.message);
    }
  };

  const handleApproveAll = async () => {
    const confirmed = await toast.confirm('Bạn có chắc chắn muốn duyệt TẤT CẢ các đánh giá đang chờ duyệt trong tháng này?');
    if (!confirmed) return;
    
    try {
      const pendingEvalIds = Object.values(evaluations)
        .filter(ev => ev.id && (ev.status === 'pending' || !ev.status))
        .map(ev => ev.id);
        
      if (pendingEvalIds.length === 0) {
        toast.info('Không có đánh giá nào đang chờ duyệt');
        return;
      }
      
      const { error } = await supabase
        .from('evaluations')
        .update({ status: 'approved' })
        .in('id', pendingEvalIds);
        
      if (error) throw error;
      toast.success(`Đã duyệt thành công ${pendingEvalIds.length} đánh giá`);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

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
  
  const getStatusBadge = (status: string) => {
    if (status === 'approved') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap"><CheckCircle2 size={12}/> Đã duyệt</span>;
    if (status === 'rejected') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30 whitespace-nowrap"><XCircle size={12}/> BCH chấm</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap">Chờ duyệt</span>;
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
      right: { style: 'thin', color: { rgb: '000000' } }
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
      'Ghi chú'
    ]);
    rowHeights.push({ hpt: 36 });

    rows.push([
      '', '', '', '', '', '', '', '',
      'Tổng điểm',
      'Mức xếp loại',
      'Tổng điểm',
      'Mức xếp loại',
      ''
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

    departments.forEach(dept => {
      const deptMembers = members.filter(m => m.department_id === dept.id);
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
          note
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
      { wch: 30 }
    ];

    const setStyle = (r: number, c: number, style: any) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    // Style tiêu đề đầu trang
    setStyle(2, 0, {
      font: { ...baseFont, sz: 13 },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(2, 7, {
      font: { ...baseFont, sz: 13, bold: true, underline: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(3, 0, {
      font: { ...baseFont, sz: 13, bold: true },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    });
    setStyle(4, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(5, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(6, 0, {
      font: { ...baseFont, sz: 13, bold: true },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    });

    // Style header bảng (row 8 & 9)
    for (let r = 8; r <= 9; r++) {
      for (let c = 0; c <= 12; c++) {
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: true },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: thinBorder
        });
      }
    }

    // Style dòng tên Chi đoàn
    deptRowIndices.forEach((r) => {
      for (let c = 0; c <= 12; c++) {
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: true },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: thinBorder
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
            wrapText: true
          },
          border: thinBorder
        });
      }
    });

    // Style dòng tổng hợp & chân trang
    setStyle(summaryIdx, 0, {
      font: { ...baseFont, sz: 11, bold: true, italic: true },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    setStyle(dateIdx, 9, {
      font: { ...baseFont, sz: 11, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(signHeaderIdx, 0, {
      font: { ...baseFont, sz: 11, bold: true, italic: true },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    setStyle(signHeaderIdx, 9, {
      font: { ...baseFont, sz: 11, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(signRoleIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    setStyle(signRoleIdx, 9, {
      font: { ...baseFont, sz: 11, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' }
    });
    setStyle(ccIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' }
    });
    setStyle(saveIdx, 0, {
      font: { ...baseFont, sz: 11 },
      alignment: { horizontal: 'left', vertical: 'center' }
    });

    XLSX.utils.book_append_sheet(wb, ws, 'mẫu phòng');
    XLSX.writeFile(wb, `Danh_gia_doan_vien_thang_${currentMonth}_${currentYear}.xlsx`);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20 flex flex-col h-screen">
      {/* Header compact */}
      <div className="flex flex-row flex-wrap items-center justify-between gap-4 flex-shrink-0 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold whitespace-nowrap text-blue-400">Duyệt đánh giá</h1>
          <div className="hidden sm:flex items-center gap-2">
            <select 
              className="form-input w-auto font-medium py-1.5 bg-slate-800 border-slate-700"
              value={currentYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                setCurrentYear(y);
                if (y === maxYear && currentMonth > maxMonth) {
                  setCurrentMonth(maxMonth);
                }
              }}
            >
              {getAvailableYears(2024).map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
            <select 
              className="form-input w-auto font-medium py-1.5 bg-slate-800 border-slate-700"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
            >
              {getAvailableMonths(currentYear).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const pendingCount = Object.values(evaluations).filter(ev => ev.id && (ev.status === 'pending' || !ev.status)).length;
            const btnClass = pendingCount > 0 
              ? "btn bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 py-1.5 px-3 text-sm shadow-lg shadow-emerald-500/20 transition-all"
              : "btn bg-slate-700/50 text-slate-500 border-slate-700 py-1.5 px-3 text-sm cursor-not-allowed";
              
            return (
              <button 
                className={btnClass} 
                onClick={pendingCount > 0 ? handleApproveAll : undefined}
                disabled={pendingCount === 0}
              >
                <Check size={16} /> <span className="hidden sm:inline">Duyệt tất cả {pendingCount > 0 && `(${pendingCount})`}</span>
              </button>
            );
          })()}
          <button className="btn btn-secondary py-1.5 px-3 text-sm" onClick={exportExcel}>
            <FileDown size={16} /> <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-12 text-slate-400">Đang tải dữ liệu...</div>
      ) : departments.length === 0 ? (
        <div className="text-center p-12 text-slate-400">Chưa có chi đoàn nào</div>
      ) : (
        <div className="glass-panel overflow-auto flex-1 max-h-[calc(100vh-160px)] relative rounded-xl shadow-2xl border border-slate-700/50">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-20 shadow-md">
              <tr>
                <th rowSpan={2} className="table-th w-10 text-center border-r border-slate-700 bg-slate-900 text-slate-300">STT</th>
                <th rowSpan={2} className="table-th min-w-[120px] border-r border-slate-700 bg-slate-900 text-slate-300">Họ và tên</th>
                <th rowSpan={2} className="table-th min-w-[100px] border-r border-slate-700 bg-slate-900 text-slate-300">Chức danh</th>
                <th colSpan={6} className="table-th text-center border-r border-slate-700 bg-slate-900 text-blue-400 font-bold border-b-slate-700">Điểm Đánh Giá</th>
                <th rowSpan={2} className="table-th text-center border-r border-slate-700 min-w-[120px] bg-slate-900 text-slate-300">Ghi chú</th>
                <th rowSpan={2} className="table-th text-center border-r border-slate-700 w-24 bg-slate-900 text-slate-300">Trạng thái</th>
                <th rowSpan={2} className="table-th text-center min-w-[120px] bg-slate-900 text-slate-300">Thao tác</th>
              </tr>
              <tr>
                <th className="table-th text-center border-r border-slate-700 text-[10px] p-1 bg-slate-800 w-12" title="Lý tưởng cách mạng, nhận thức chính trị">Lý tưởng<br/>nhận thức</th>
                <th className="table-th text-center border-r border-slate-700 text-[10px] p-1 bg-slate-800 w-12" title="Đạo đức, lối sống, tác phong đoàn viên">Đạo đức<br/>lối sống</th>
                <th className="table-th text-center border-r border-slate-700 text-[10px] p-1 bg-slate-800 w-12" title="Công tác chuyên môn nghiệp vụ">Chuyên môn<br/>nghiệp vụ</th>
                <th className="table-th text-center border-r border-slate-700 text-[10px] p-1 bg-slate-800 w-12" title="Rèn luyện sức khoẻ">Rèn luyện<br/>sức khoẻ</th>
                <th className="table-th text-center border-r border-slate-700 text-[10px] p-1 bg-slate-800 w-12" title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn">Ý thức<br/>phong trào</th>
                <th className="table-th text-center border-r border-slate-700 text-xs font-bold bg-slate-800 w-12">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => {
                const deptMembers = members.filter(m => m.department_id === dept.id);
                if (deptMembers.length === 0) return null;

                const hasAnyEval = deptMembers.some(member => {
                  const ev = evaluations[member.id];
                  return ev && (ev.id || ev.total_score !== undefined);
                });

                return (
                  <Fragment key={dept.id}>
                    <tr className="bg-blue-900/20">
                      <td colSpan={12} className="px-4 py-2 border-y border-slate-700/50 font-bold text-[13px] text-blue-300 uppercase tracking-wider">
                        {dept.name}
                      </td>
                    </tr>
                    {!hasAnyEval ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-slate-500 italic border-b border-slate-700/50">
                          Chưa có bản chấm điểm
                        </td>
                      </tr>
                    ) : (
                      deptMembers.map((member, index) => {
                        const ev = evaluations[member.id] || {};
                      const hasEval = ev.id || ev.total_score !== undefined;
                      const isPending = !ev.status || ev.status === 'pending';
                      const isRejected = ev.status === 'rejected';
                      const isEditing = editingId === member.id;
                      
                      // Active scores logic
                      const s1 = isEditing ? rejectForm.bch_score_1 : (isRejected ? ev.bch_score_1 : ev.score_1);
                      const s2 = isEditing ? rejectForm.bch_score_2 : (isRejected ? ev.bch_score_2 : ev.score_2);
                      const s3 = isEditing ? rejectForm.bch_score_3 : (isRejected ? ev.bch_score_3 : ev.score_3);
                      const s4 = isEditing ? rejectForm.bch_score_4 : (isRejected ? ev.bch_score_4 : ev.score_4);
                      const s5 = isEditing ? rejectForm.bch_score_5 : (isRejected ? ev.bch_score_5 : ev.score_5);
                      
                      const computedBchTotal = rejectForm.bch_score_1 + rejectForm.bch_score_2 + rejectForm.bch_score_3 + rejectForm.bch_score_4 + rejectForm.bch_score_5;
                      const total = isEditing ? computedBchTotal : (isRejected ? ev.bch_total_score : ev.total_score);
                      const note = isEditing ? rejectForm.bch_note : (isRejected ? ev.bch_note : ev.note);
                      
                      // Row highlight if editing or rejected
                      const trClass = isEditing 
                        ? 'bg-amber-900/20 border-l-2 border-l-amber-400 shadow-inner' 
                        : isRejected 
                          ? 'bg-red-900/10 hover:bg-red-900/20 transition-colors border-l-2 border-l-red-500/50' 
                          : 'hover:bg-slate-800/40 transition-colors border-l-2 border-l-transparent';

                      const textClass = isEditing || isRejected ? 'text-amber-400 font-medium' : 'text-slate-300';
                      const totalClass = isEditing || isRejected ? 'text-amber-400 font-bold' : 'text-white font-bold';

                      return (
                        <tr key={member.id} className={trClass}>
                          <td className="table-td text-center border-r border-slate-700/50">{index + 1}</td>
                          <td className="table-td font-medium border-r border-slate-700/50 text-white">{member.full_name}</td>
                          <td className="table-td text-slate-400 border-r border-slate-700/50 text-xs">{member.title}</td>
                          
                          {/* Điểm 1-5 */}
                          {[
                            { val: s1, old: ev.score_1, key: 'bch_score_1' },
                            { val: s2, old: ev.score_2, key: 'bch_score_2' },
                            { val: s3, old: ev.score_3, key: 'bch_score_3' },
                            { val: s4, old: ev.score_4, key: 'bch_score_4' },
                            { val: s5, old: ev.score_5, key: 'bch_score_5' }
                          ].map((col, idx) => (
                            <td key={idx} className="table-td text-center border-r border-slate-700/50 p-1 relative">
                              {isEditing ? (
                                <input 
                                  type="number" min="0" max="20"
                                  className="w-full h-7 bg-black/50 text-center font-bold text-sm text-amber-400 focus:bg-slate-800 rounded outline-none border border-amber-500/50 focus:border-amber-400"
                                  value={col.val ?? ''}
                                  onChange={(e) => setRejectForm({ ...rejectForm, [col.key]: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                />
                              ) : (
                                <>
                                  <span className={`text-sm ${textClass}`}>{hasEval ? (col.val ?? '-') : '-'}</span>
                                  {isRejected && col.val !== col.old && (
                                    <span className="absolute top-0 right-1 text-[12px] text-slate-500 line-through" title="Điểm chi đoàn chấm">{col.old}</span>
                                  )}
                                </>
                              )}
                            </td>
                          ))}
                          
                          {/* Tổng điểm */}
                          <td className="table-td text-center border-r border-slate-700/50 bg-slate-800/30 relative">
                            {hasEval ? <span className={`text-[15px] ${totalClass}`}>{total || 0}</span> : <span className="text-slate-500 italic text-xs">-</span>}
                            {isRejected && !isEditing && total !== ev.total_score && (
                              <span className="absolute top-0 right-1 text-[12px] text-slate-500 line-through" title="Điểm chi đoàn chấm">{ev.total_score}</span>
                            )}
                          </td>
                          
                          {/* Ghi chú */}
                          <td className="table-td border-r border-slate-700/50 p-1 align-middle">
                            {isEditing ? (
                              <textarea 
                                className="w-full h-10 min-h-[40px] bg-black/50 text-xs text-amber-200 focus:bg-slate-800 rounded outline-none border border-amber-500/50 focus:border-amber-400 p-1.5 resize-y"
                                value={rejectForm.bch_note || ''}
                                onChange={(e) => setRejectForm({ ...rejectForm, bch_note: e.target.value })}
                                placeholder="Ghi chú BCH..."
                              />
                            ) : (
                              <div className={`text-xs whitespace-pre-wrap line-clamp-3 ${textClass}`} title={(!hasEval ? (note || 'Đoàn viên mới') : note) || ''}>
                                {!hasEval ? (note || 'Đoàn viên mới') : (note || '-')}
                              </div>
                            )}
                          </td>
                          
                          {/* Trạng thái */}
                          <td className="table-td text-center border-r border-slate-700/50">
                            {hasEval && getStatusBadge(ev.status)}
                          </td>
                          
                          {/* Thao tác */}
                          <td className="table-td text-center p-2">
                            {!hasEval ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-xs text-slate-500 italic">Chưa chấm</span>
                                <button
                                  className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                                  title="Xóa đoàn viên"
                                  onClick={() => handleDeleteMember(member)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : isEditing ? (
                              <div className="flex flex-col gap-1.5">
                                <button 
                                  className="flex items-center justify-center gap-1 w-full py-1 rounded bg-amber-500 text-amber-950 hover:bg-amber-400 transition-colors text-[11px] font-bold shadow-lg shadow-amber-500/20"
                                  title="Lưu lại điểm từ chối"
                                  onClick={() => handleSaveReject(ev.id)}
                                >
                                  <Save size={12} /> Lưu
                                </button>
                                <button 
                                  className="flex items-center justify-center gap-1 w-full py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-[11px] font-semibold"
                                  onClick={() => setEditingId(null)}
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center items-center gap-1.5">
                                {isPending ? (
                                  <>
                                    <button 
                                      className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-xs font-semibold border border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/20"
                                      title="Duyệt điểm này"
                                      onClick={() => handleApprove(ev.id)}
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button 
                                      className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-semibold border border-red-500/20 hover:shadow-lg hover:shadow-red-500/20"
                                      title="Từ chối & Chấm lại"
                                      onClick={() => startReject(ev, member.id)}
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors text-[11px] font-medium"
                                    onClick={() => startReject(ev, member.id)}
                                    title="Sửa lại quyết định"
                                  >
                                    <Edit size={12} /> Sửa
                                  </button>
                                )}
                                <button
                                  className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                                  title="Xóa đoàn viên"
                                  onClick={() => handleDeleteMember(member)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

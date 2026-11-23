'use client';

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { FileDown, Search, Award } from 'lucide-react';
import XLSX from 'xlsx-js-style';

interface MonthSlot {
  year: number;
  month: number;
  label: string;
  key: string;
}

export default function AnnualReviewPage() {
  const currentCalendarYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentCalendarYear);
  const [departments, setDepartments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [evalMap, setEvalMap] = useState<Record<string, any>>({});
  const [nameEvalMap, setNameEvalMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const normalizeName = (name: string | null | undefined) =>
    String(name || '')
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  // Chu kỳ 12 tháng: từ T12 năm trước đến T11 năm được chọn
  const monthSlots: MonthSlot[] = useMemo(() => {
    const prevYear = selectedYear - 1;
    const prevShort = String(prevYear).slice(-2);
    const currShort = String(selectedYear).slice(-2);

    const slots: MonthSlot[] = [
      { year: prevYear, month: 12, label: `T12/${prevShort}`, key: `${prevYear}-12` },
    ];
    for (let m = 1; m <= 11; m++) {
      slots.push({
        year: selectedYear,
        month: m,
        label: `T${m}/${currShort}`,
        key: `${selectedYear}-${m}`,
      });
    }
    return slots;
  }, [selectedYear]);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: deptsData }, { data: membersData }, { data: evalsData }] = await Promise.all([
        supabase.from('departments').select('id, name').order('name', { ascending: true }),
        supabase.from('members').select('*').order('created_at', { ascending: true }),
        supabase
          .from('evaluations')
          .select('member_id, year, month, total_score, bch_total_score, status')
          .or(
            `and(year.eq.${selectedYear - 1},month.eq.12),and(year.eq.${selectedYear},month.gte.1,month.lte.11)`
          ),
      ]);

      setDepartments(deptsData || []);
      const allMembers = membersData || [];

      // Map member_id -> member để tra cứu tên chuẩn hóa và thời điểm tạo
      const memberById: Record<string, any> = {};
      allMembers.forEach((m) => {
        memberById[m.id] = m;
      });

      const mapById: Record<string, any> = {};
      const mapByName: Record<string, any> = {};

      (evalsData || []).forEach((ev) => {
        const slotKey = `${ev.year}-${ev.month}`;
        mapById[`${ev.member_id}_${slotKey}`] = ev;

        const m = memberById[ev.member_id];
        if (m) {
          const norm = normalizeName(m.full_name);
          const nameKey = `${norm}_${slotKey}`;
          const existingEv = mapByName[nameKey];
          if (!existingEv) {
            mapByName[nameKey] = { ...ev, _memberCreatedAt: m.created_at };
          } else {
            // Ưu tiên bản ghi của member được tạo mới hơn (ở chi đoàn mới)
            const currCreated = new Date(m.created_at || 0).getTime();
            const prevCreated = new Date(existingEv._memberCreatedAt || 0).getTime();
            if (currCreated >= prevCreated) {
              mapByName[nameKey] = { ...ev, _memberCreatedAt: m.created_at };
            }
          }
        }
      });

      // Nếu một đoàn viên được nhập trùng tên ở nhiều chi đoàn (không bấm chuyển tổ),
      // chỉ giữ lại bản ghi ở chi đoàn mới nhất (có tháng chấm mới nhất / created_at mới nhất)
      const latestEvalYmByMember: Record<string, number> = {};
      (evalsData || []).forEach((ev) => {
        const ym = ev.year * 100 + ev.month;
        if (!latestEvalYmByMember[ev.member_id] || ym > latestEvalYmByMember[ev.member_id]) {
          latestEvalYmByMember[ev.member_id] = ym;
        }
      });

      const dedupByName = new Map<string, any>();
      allMembers.forEach((m) => {
        const norm = normalizeName(m.full_name);
        if (!norm) return;
        const prev = dedupByName.get(norm);
        if (!prev) {
          dedupByName.set(norm, m);
        } else {
          const mCreated = new Date(m.created_at || 0).getTime();
          const prevCreated = new Date(prev.created_at || 0).getTime();
          const mYm = latestEvalYmByMember[m.id] || 0;
          const prevYm = latestEvalYmByMember[prev.id] || 0;

          if (mCreated > prevCreated || (mCreated === prevCreated && mYm >= prevYm)) {
            dedupByName.set(norm, m);
          }
        }
      });

      setMembers(Array.from(dedupByName.values()));
      setEvalMap(mapById);
      setNameEvalMap(mapByName);
    } catch (err) {
      console.error('Error fetching annual review data:', err);
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

  const getMemberSummary = (member: any) => {
    const memberId = member.id;
    const norm = normalizeName(member.full_name);
    let sum = 0;
    let count = 0;
    const scores = monthSlots.map((slot) => {
      // Ưu tiên điểm trên member_id hiện tại; nếu tháng đó ở chi đoàn mới chưa có thì tự kéo điểm theo tên từ chi đoàn cũ
      const ev = evalMap[`${memberId}_${slot.key}`] || nameEvalMap[`${norm}_${slot.key}`];
      if (!ev) return { score: null as number | null, isRejected: false };
      const isRejected = ev.status === 'rejected';
      const val = isRejected ? ev.bch_total_score : ev.total_score;
      if (typeof val === 'number') {
        sum += val;
        count++;
        return { score: val, isRejected };
      }
      return { score: null as number | null, isRejected };
    });

    const avg = count > 0 ? Number((sum / count).toFixed(4)) : null;
    const rank = getRank(avg);
    return { scores, avg, count, rank };
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
        const { avg, rank } = getMemberSummary(m);
        if (avg != null) {
          res.evaluated++;
          if (rank.type === 'A') res.A++;
          else if (rank.type === 'B') res.B++;
          else if (rank.type === 'C') res.C++;
          else if (rank.type === 'D') res.D++;
        }
      });
    });
    return res;
  }, [filteredDepartments, evalMap, monthSlots]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];
    const merges: any[] = [];
    const rowHeights: any[] = [];

    const emptyRow = () => Array(17).fill('');
    const thinBorder = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
    const baseFont = { name: 'Times New Roman', sz: 11 };

    // Row 0-3: Quốc hiệu & Tên đơn vị
    const r0 = emptyRow();
    r0[0] = 'ĐOÀN XÃ QUẢNG OAI';
    r0[5] = 'ĐOÀN THANH NIÊN CỘNG SẢN HỒ CHÍ MINH';
    rows.push(r0);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
    merges.push({ s: { r: 0, c: 5 }, e: { r: 0, c: 16 } });

    const r1 = emptyRow();
    r1[0] = 'ĐOÀN THANH NIÊN TRUNG TÂM CHĂM';
    rows.push(r1);
    rowHeights.push({ hpt: 18 });
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });

    const r2 = emptyRow();
    r2[0] = 'SÓC VÀ PHỤC HỒI CHỨC NĂNG NGƯỜI';
    rows.push(r2);
    rowHeights.push({ hpt: 18 });
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 4 } });

    const r3 = emptyRow();
    r3[0] = 'TÂM THẦN SỐ 1 HÀ NỘI';
    rows.push(r3);
    rowHeights.push({ hpt: 18 });
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 4 } });

    // Row 4: blank
    rows.push(emptyRow());
    rowHeights.push({ hpt: 10 });

    // Row 5-6: Tiêu đề
    const r5 = emptyRow();
    r5[0] = 'BẢNG TỔNG HỢP';
    rows.push(r5);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 16 } });

    const r6 = emptyRow();
    r6[0] = `KẾT QUẢ BÌNH XÉT ĐOÀN VIÊN NĂM ${selectedYear}`;
    rows.push(r6);
    rowHeights.push({ hpt: 22 });
    merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 16 } });

    // Row 7: blank
    rows.push(emptyRow());
    rowHeights.push({ hpt: 10 });

    // Row 8-9: Header 2 dòng
    const headerTop = emptyRow();
    headerTop[0] = 'TT';
    headerTop[1] = 'Họ và tên';
    headerTop[2] = 'Chức danh';
    headerTop[3] = 'ĐIỂM BÌNH XÉT';
    headerTop[15] = 'Trung bình';
    headerTop[16] = 'Đánh giá';
    rows.push(headerTop);
    rowHeights.push({ hpt: 24 });

    const headerSub = emptyRow();
    monthSlots.forEach((slot, idx) => {
      headerSub[3 + idx] = slot.label;
    });
    rows.push(headerSub);
    rowHeights.push({ hpt: 22 });

    merges.push({ s: { r: 8, c: 0 }, e: { r: 9, c: 0 } });
    merges.push({ s: { r: 8, c: 1 }, e: { r: 9, c: 1 } });
    merges.push({ s: { r: 8, c: 2 }, e: { r: 9, c: 2 } });
    merges.push({ s: { r: 8, c: 3 }, e: { r: 8, c: 14 } });
    merges.push({ s: { r: 8, c: 15 }, e: { r: 9, c: 15 } });
    merges.push({ s: { r: 8, c: 16 }, e: { r: 9, c: 16 } });

    const deptRowIndices: number[] = [];
    const dataRowIndices: number[] = [];
    let globalIndex = 1;

    filteredDepartments.forEach((dept) => {
      const deptRowIdx = rows.length;
      const deptRow = emptyRow();
      deptRow[0] = dept.name.toUpperCase();
      rows.push(deptRow);
      rowHeights.push({ hpt: 24 });
      deptRowIndices.push(deptRowIdx);
      merges.push({ s: { r: deptRowIdx, c: 0 }, e: { r: deptRowIdx, c: 16 } });

      dept.members.forEach((member: any) => {
        const { scores, avg, rank } = getMemberSummary(member);
        const rowIdx = rows.length;
        dataRowIndices.push(rowIdx);
        rowHeights.push({ hpt: 22 });

        rows.push([
          globalIndex++,
          member.full_name,
          member.title,
          ...scores.map((s) => (s.score != null ? s.score : '')),
          avg != null ? avg : '',
          avg != null ? rank.text : '',
        ]);
      });
    });

    // Dòng tổng hợp
    const summaryIdx = rows.length;
    const summaryRow = emptyRow();
    summaryRow[0] = `TỔNG: ${stats.evaluated} đoàn viên tham gia đánh giá trong đó: HTXSNV: ${stats.A} đoàn viên. HTTNV: ${stats.B} đoàn viên. HTNV: ${stats.C} đoàn viên. KHTNV: ${stats.D} đoàn viên.`;
    rows.push(summaryRow);
    rowHeights.push({ hpt: 24 });
    merges.push({ s: { r: summaryIdx, c: 0 }, e: { r: summaryIdx, c: 16 } });

    rows.push(emptyRow());
    rowHeights.push({ hpt: 12 });

    // Chân trang chữ ký
    const today = new Date();
    const dateIdx = rows.length;
    const dateRow = emptyRow();
    dateRow[9] = `Quảng Oai, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
    rows.push(dateRow);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: dateIdx, c: 9 }, e: { r: dateIdx, c: 16 } });

    const sign1Idx = rows.length;
    const sign1Row = emptyRow();
    sign1Row[9] = 'TM. BCH ĐOÀN TN TRUNG TÂM';
    rows.push(sign1Row);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: sign1Idx, c: 9 }, e: { r: sign1Idx, c: 16 } });

    const sign2Idx = rows.length;
    const sign2Row = emptyRow();
    sign2Row[9] = 'BÍ THƯ';
    rows.push(sign2Row);
    rowHeights.push({ hpt: 20 });
    merges.push({ s: { r: sign2Idx, c: 9 }, e: { r: sign2Idx, c: 16 } });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!rows'] = rowHeights;
    ws['!cols'] = [
      { wch: 5 },
      { wch: 24 },
      { wch: 13 },
      ...Array(12).fill({ wch: 8 }),
      { wch: 11 },
      { wch: 13 },
    ];

    const setStyle = (r: number, c: number, style: any) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    // Tiêu đề đầu trang
    setStyle(0, 0, {
      font: { ...baseFont, sz: 12 },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(0, 5, {
      font: { ...baseFont, sz: 12, bold: true, underline: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    for (let r = 1; r <= 3; r++) {
      setStyle(r, 0, {
        font: { ...baseFont, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      });
    }
    setStyle(5, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(6, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    // Header bảng
    for (let r = 8; r <= 9; r++) {
      for (let c = 0; c <= 16; c++) {
        setStyle(r, c, {
          font: { ...baseFont, bold: true },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: thinBorder,
        });
      }
    }

    // Dòng chi đoàn
    deptRowIndices.forEach((r) => {
      for (let c = 0; c <= 16; c++) {
        setStyle(r, c, {
          font: { ...baseFont, bold: true },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: thinBorder,
        });
      }
    });

    // Dòng dữ liệu đoàn viên
    dataRowIndices.forEach((r) => {
      for (let c = 0; c <= 16; c++) {
        const isBold = c === 15;
        const isLeft = c === 1;
        setStyle(r, c, {
          font: { ...baseFont, bold: isBold },
          alignment: {
            horizontal: isLeft ? 'left' : 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: thinBorder,
        });
      }
    });

    setStyle(summaryIdx, 0, {
      font: { ...baseFont, bold: true, italic: true },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
    setStyle(dateIdx, 9, {
      font: { ...baseFont, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(sign1Idx, 9, {
      font: { ...baseFont, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(sign2Idx, 9, {
      font: { ...baseFont, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Bình xét cuối năm');
    XLSX.writeFile(wb, `Binh_xet_cuoi_nam_${selectedYear}.xlsx`);
  };

  const yearOptions = Array.from(
    { length: Math.max(1, currentCalendarYear - 2025 + 1) },
    (_, i) => currentCalendarYear - i
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-10 flex flex-col">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-blue-400 flex items-center gap-2">
            <Award size={22} />
            Tổng hợp bình xét cuối năm {selectedYear}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tự động tổng hợp điểm từ tháng 12/{selectedYear - 1} đến tháng 11/{selectedYear}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="form-input w-auto font-medium py-1.5 bg-slate-800 border-slate-700"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                Năm {y} (T12/{String(y - 1).slice(-2)} - T11/{String(y).slice(-2)})
              </option>
            ))}
          </select>

          <select
            className="form-input w-auto font-medium py-1.5 bg-slate-800 border-slate-700 max-w-[220px]"
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
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm đoàn viên..."
              className="form-input pl-9 py-1.5 w-44 bg-slate-800 border-slate-700 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-secondary py-1.5 px-3 text-sm" onClick={exportExcel}>
            <FileDown size={16} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">Tổng đoàn viên</div>
          <div className="text-xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">Đã có điểm</div>
          <div className="text-xl font-bold text-blue-400 mt-1">{stats.evaluated}</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">HTXSNV (A)</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{stats.A}</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">HTTNV (B)</div>
          <div className="text-xl font-bold text-sky-400 mt-1">{stats.B}</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">HTNV (C)</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{stats.C}</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-xs text-slate-400">KHTNV (D)</div>
          <div className="text-xl font-bold text-rose-400 mt-1">{stats.D}</div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-md">
              <tr>
                <th rowSpan={2} className="table-th text-center w-10 border-r border-slate-700/50 text-xs">
                  TT
                </th>
                <th rowSpan={2} className="table-th min-w-[180px] border-r border-slate-700/50 text-xs">
                  Họ và tên
                </th>
                <th rowSpan={2} className="table-th min-w-[110px] border-r border-slate-700/50 text-xs">
                  Chức danh
                </th>
                <th colSpan={12} className="table-th text-center border-r border-slate-700/50 bg-slate-800/60 text-xs">
                  ĐIỂM BÌNH XÉT
                </th>
                <th rowSpan={2} className="table-th text-center w-24 border-r border-slate-700/50 text-xs">
                  Trung bình
                </th>
                <th rowSpan={2} className="table-th text-center w-28 text-xs">
                  Đánh giá
                </th>
              </tr>
              <tr>
                {monthSlots.map((slot) => (
                  <th
                    key={slot.key}
                    className="table-th text-center w-14 border-r border-slate-700/50 bg-slate-800/40 text-[11px] px-1"
                  >
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={17} className="text-center py-10 text-slate-400">
                    Đang tổng hợp dữ liệu...
                  </td>
                </tr>
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={17} className="text-center py-10 text-slate-400">
                    Chưa có dữ liệu đoàn viên phù hợp.
                  </td>
                </tr>
              ) : (
                (() => {
                  let stt = 1;
                  return filteredDepartments.map((dept) => (
                    <Fragment key={dept.id}>
                      <tr className="bg-slate-800/70">
                        <td colSpan={17} className="px-4 py-2 font-bold text-blue-300 text-xs uppercase tracking-wide">
                          {dept.name}
                        </td>
                      </tr>
                      {dept.members.map((member: any) => {
                        const { scores, avg, rank } = getMemberSummary(member);
                        return (
                          <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="table-td text-center text-xs text-slate-400 border-r border-slate-800/60">
                              {stt++}
                            </td>
                            <td className="table-td font-medium text-sm text-white border-r border-slate-800/60">
                              {member.full_name}
                            </td>
                            <td className="table-td text-xs text-slate-300 border-r border-slate-800/60">
                              {member.title}
                            </td>
                            {scores.map((s, idx) => (
                              <td
                                key={idx}
                                className={`table-td text-center text-xs border-r border-slate-800/60 px-1 ${
                                  s.isRejected ? 'text-amber-300 font-semibold' : 'text-slate-200'
                                }`}
                                title={s.isRejected ? 'Điểm do BCH Đoàn chấm lại' : undefined}
                              >
                                {s.score != null ? s.score : <span className="text-slate-600">-</span>}
                              </td>
                            ))}
                            <td className="table-td text-center font-bold text-sm text-blue-300 border-r border-slate-800/60">
                              {avg != null ? avg : <span className="text-slate-600">-</span>}
                            </td>
                            <td className="table-td text-center">
                              {avg != null ? (
                                <span className={`badge ${rank.class}`}>{rank.text}</span>
                              ) : (
                                <span className="text-slate-600 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ));
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


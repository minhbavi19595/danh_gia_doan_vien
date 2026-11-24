'use client';

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { FileDown, Search, Award, Trash2, Trophy, X, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import XLSX from 'xlsx-js-style';
import { sortMembersByTitle, getTitlePriority } from '@/lib/sortMembers';

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
  const [minMonthsForA, setMinMonthsForA] = useState<number>(8);
  const [showTopModal, setShowTopModal] = useState<boolean>(false);
  const [topLimit, setTopLimit] = useState<string>('10');
  const [topDeptFilter, setTopDeptFilter] = useState<string>('all');
  const [topSortOrder, setTopSortOrder] = useState<'desc' | 'asc'>('desc');
  const toast = useToast();

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const fetchAllMembers = async () => {
        const all: any[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('members')
            .select('*')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const fetchAllEvaluations = async () => {
        const all: any[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('evaluations')
            .select('id, member_id, year, month, total_score, bch_total_score, status')
            .or(
              `and(year.eq.${selectedYear - 1},month.eq.12),and(year.eq.${selectedYear},month.gte.1,month.lte.11)`
            )
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [{ data: deptsData }, allMembers, evalsData] = await Promise.all([
        supabase.from('departments').select('id, name').order('name', { ascending: true }),
        fetchAllMembers(),
        fetchAllEvaluations(),
      ]);

      setDepartments(deptsData || []);

      // Map member_id -> member để tra cứu tên chuẩn hóa và thời điểm tạo
      const memberById: Record<string, any> = {};
      allMembers.forEach((m) => {
        memberById[m.id] = m;
      });

      const getEffectiveScore = (ev: any) => {
        if (!ev) return 0;
        return ev.status === 'rejected' ? (ev.bch_total_score || 0) : (ev.total_score || 0);
      };

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
            // Ưu tiên bản ghi có điểm > 0; nếu cả hai đều có điểm > 0 thì ưu tiên member mới hơn
            const currScore = getEffectiveScore(ev);
            const prevScore = getEffectiveScore(existingEv);
            const currCreated = new Date(m.created_at || 0).getTime();
            const prevCreated = new Date(existingEv._memberCreatedAt || 0).getTime();
            if (
              (currScore > 0 && prevScore <= 0) ||
              ((currScore > 0) === (prevScore > 0) && currCreated >= prevCreated)
            ) {
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

      setMembers(sortMembersByTitle(Array.from(dedupByName.values())));
      setEvalMap(mapById);
      setNameEvalMap(mapByName);
    } catch (err) {
      console.error('Error fetching annual review data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

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

  const getRank = (score: number | null | undefined, evaluatedMonths = 0) => {
    if (score == null || score <= 0) return { text: '-', class: '', type: '' };
    if (score >= 90) {
      if (evaluatedMonths >= minMonthsForA) {
        return { text: 'HTXSNV', class: 'badge-a', type: 'A' };
      }
      return { text: 'HTTNV', class: 'badge-b', type: 'B' };
    }
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
      // Ưu tiên điểm trên member_id hiện tại nếu có điểm > 0; nếu không có thì tự kéo điểm theo tên từ chi đoàn cũ
      const directEv = evalMap[`${memberId}_${slot.key}`];
      const directVal = directEv
        ? directEv.status === 'rejected'
          ? directEv.bch_total_score
          : directEv.total_score
        : null;
      const ev =
        typeof directVal === 'number' && directVal > 0
          ? directEv
          : nameEvalMap[`${norm}_${slot.key}`] || directEv;
      if (!ev) return { score: null as number | null, isRejected: false };
      const isRejected = ev.status === 'rejected';
      const val = isRejected ? ev.bch_total_score : ev.total_score;
      if (typeof val === 'number' && val > 0) {
        sum += val;
        count++;
        return { score: val, isRejected };
      }
      return { score: null as number | null, isRejected };
    });

    const avg = count > 0 ? Number((sum / count).toFixed(4)) : null;
    const rank = getRank(avg, count);
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
  }, [filteredDepartments, evalMap, nameEvalMap, monthSlots, minMonthsForA]);

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

  // Danh sách đủ điều kiện xếp hạng: phải có đủ 12/12 tháng có điểm (> 0)
  const deptNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d) => {
      m[d.id] = d.name;
    });
    return m;
  }, [departments]);

  const eligibleRanking = useMemo(() => {
    const list = members
      .filter((m) => topDeptFilter === 'all' || m.department_id === topDeptFilter)
      .map((member) => {
        const { scores, avg, count, rank } = getMemberSummary(member);
        const numericScores = scores
          .map((s) => s.score)
          .filter((v): v is number => typeof v === 'number' && v > 0);
        const minScore = numericScores.length > 0 ? Math.min(...numericScores) : null;
        const maxScore = numericScores.length > 0 ? Math.max(...numericScores) : null;
        return {
          member,
          departmentName: deptNameMap[member.department_id] || 'Chưa rõ chi đoàn',
          avg,
          count,
          rank,
          minScore,
          maxScore,
        };
      })
      .filter((item) => item.count === 12 && item.avg != null);

    list.sort((a, b) => {
      const diff = (b.avg ?? 0) - (a.avg ?? 0);
      if (diff !== 0) return topSortOrder === 'desc' ? diff : -diff;
      const pDiff = getTitlePriority(a.member.title) - getTitlePriority(b.member.title);
      if (pDiff !== 0) return pDiff;
      return String(a.member.full_name || '').localeCompare(String(b.member.full_name || ''), 'vi');
    });

    return list;
  }, [members, topDeptFilter, topSortOrder, evalMap, nameEvalMap, monthSlots, deptNameMap]);

  const displayedRanking = useMemo(() => {
    if (topLimit === 'all' || topLimit.trim() === '') return eligibleRanking;
    const n = parseInt(topLimit, 10);
    if (isNaN(n) || n <= 0) return eligibleRanking;
    return eligibleRanking.slice(0, n);
  }, [eligibleRanking, topLimit]);

  const exportTopRankingExcel = () => {
    if (displayedRanking.length === 0) {
      toast.info('Không có đoàn viên nào đủ 12 tháng đánh giá để xuất.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const rows: any[][] = [];
    const thinBorder = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    };
    const baseFont = { name: 'Times New Roman', sz: 12 };

    const limitLabel =
      topLimit === 'all' || !topLimit
        ? `TẤT CẢ (${displayedRanking.length} ĐOÀN VIÊN)`
        : `TOP ${displayedRanking.length}`;

    rows.push([`DANH SÁCH XẾP HẠNG ĐIỂM TRUNG BÌNH NĂM ${selectedYear} - ${limitLabel}`]);
    rows.push([
      `Điều kiện: Đủ 12/12 tháng đánh giá (T12/${selectedYear - 1} - T11/${selectedYear})${
        topDeptFilter !== 'all' ? ` | Chi đoàn: ${deptNameMap[topDeptFilter] || ''}` : ' | Toàn Trung tâm'
      }`,
    ]);
    rows.push([]);
    rows.push(['Hạng', 'Họ và tên', 'Chức danh', 'Chi đoàn', 'Số tháng', 'Điểm TB', 'Xếp loại']);

    displayedRanking.forEach((item, idx) => {
      rows.push([
        idx + 1,
        item.member.full_name,
        item.member.title,
        item.departmentName,
        `${item.count}/12`,
        item.avg,
        item.rank.text,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    ];
    ws['!cols'] = [
      { wch: 7 },
      { wch: 25 },
      { wch: 22 },
      { wch: 32 },
      { wch: 11 },
      { wch: 12 },
      { wch: 13 },
    ];
    ws['!rows'] = [
      { hpt: 26 },
      { hpt: 20 },
      { hpt: 10 },
      { hpt: 26 },
      ...displayedRanking.map(() => ({ hpt: 22 })),
    ];

    const setStyle = (r: number, c: number, style: any) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    setStyle(0, 0, {
      font: { ...baseFont, sz: 14, bold: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });
    setStyle(1, 0, {
      font: { ...baseFont, sz: 11, italic: true },
      alignment: { horizontal: 'center', vertical: 'center' },
    });

    for (let c = 0; c <= 6; c++) {
      setStyle(3, c, {
        font: { ...baseFont, sz: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: thinBorder,
      });
    }

    displayedRanking.forEach((_, idx) => {
      const r = 4 + idx;
      for (let c = 0; c <= 6; c++) {
        const isLeft = c === 1 || c === 3;
        const isBold = c === 0 || c === 5;
        setStyle(r, c, {
          font: { ...baseFont, sz: 11, bold: isBold },
          alignment: { horizontal: isLeft ? 'left' : 'center', vertical: 'center', wrapText: true },
          border: thinBorder,
        });
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Xếp hạng');
    XLSX.writeFile(wb, `Top_Xep_Hang_Nam_${selectedYear}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      {/* Compact Header + Filters + Inline Stats */}
      <div className="flex flex-col gap-2 bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800 shadow-lg shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Award size={18} className="text-blue-400 shrink-0" />
            <h1 className="text-base sm:text-lg font-bold text-blue-400 whitespace-nowrap">
              Bình xét cuối năm {selectedYear}
            </h1>
            <span className="hidden xl:inline text-xs text-slate-400 whitespace-nowrap">
              (T12/{selectedYear - 1} – T11/{selectedYear})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  Năm {y} (T12/{String(y - 1).slice(-2)}-T11/{String(y).slice(-2)})
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

            <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
              <span className="text-slate-400 whitespace-nowrap">HTXSNV ≥</span>
              <select
                className="bg-transparent text-emerald-300 font-semibold focus:outline-none cursor-pointer"
                value={minMonthsForA}
                onChange={(e) => setMinMonthsForA(Number(e.target.value))}
                title="Số tháng đánh giá tối thiểu để được xếp loại HTXSNV (nếu ít hơn tối đa chỉ được HTTNV)"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m} className="bg-slate-800 text-white">
                    {m} tháng
                  </option>
                ))}
              </select>
            </div>

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
              className="btn bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 py-1 px-2.5 text-xs"
              onClick={() => {
                setTopDeptFilter(deptFilter);
                setShowTopModal(true);
              }}
              title="Xem bảng xếp hạng điểm trung bình cao nhất (đủ 12 tháng)"
            >
              <Trophy size={14} />
              Xếp hạng Top
            </button>

            <button
              className="btn btn-secondary py-1 px-2.5 text-xs"
              onClick={exportExcel}
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
            Có điểm: <strong>{stats.evaluated}</strong>
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

      {/* Table - tự co giãn vừa khít phần màn hình còn lại */}
      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl w-full flex-1 min-h-0 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-30 bg-slate-900">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-40 bg-slate-900 table-th text-center w-[42px] min-w-[42px] border-r border-b border-slate-700/80 text-[11px] px-1 py-2"
                >
                  TT
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[42px] z-40 bg-slate-900 table-th w-[190px] min-w-[190px] border-r border-b border-slate-700/80 text-[11px] px-2.5 py-2"
                >
                  Họ và tên
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[232px] z-40 bg-slate-900 table-th w-[155px] min-w-[155px] border-r-2 border-b border-slate-600 text-[11px] px-2.5 py-2 shadow-[2px_0_6px_rgba(0,0,0,0.4)]"
                >
                  Chức danh
                </th>
                <th
                  colSpan={12}
                  className="bg-slate-800 table-th text-center border-r border-b border-slate-700/80 text-[11px] py-1.5"
                >
                  ĐIỂM BÌNH XÉT
                </th>
                <th
                  rowSpan={2}
                  className="bg-slate-900 table-th text-center w-[72px] min-w-[72px] border-r border-b border-slate-700/80 text-[11px] px-1 py-2"
                >
                  Trung bình
                </th>
                <th
                  rowSpan={2}
                  className="bg-slate-900 table-th text-center w-[78px] min-w-[78px] border-r border-b border-slate-700/80 text-[11px] px-1 py-2"
                >
                  Đánh giá
                </th>
                <th
                  rowSpan={2}
                  className="bg-slate-900 table-th text-center w-[44px] min-w-[44px] border-b border-slate-700/80 text-[11px] px-1 py-2"
                >
                  Xóa
                </th>
              </tr>
              <tr>
                {monthSlots.map((slot) => (
                  <th
                    key={slot.key}
                    className="bg-slate-800 table-th text-center min-w-[46px] border-r border-b border-slate-700/80 text-[11px] px-1 py-1.5 whitespace-nowrap"
                  >
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={18} className="text-center py-10 text-slate-400">
                    Đang tổng hợp dữ liệu...
                  </td>
                </tr>
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td colSpan={18} className="text-center py-10 text-slate-400">
                    Chưa có dữ liệu đoàn viên phù hợp.
                  </td>
                </tr>
              ) : (
                (() => {
                  let stt = 1;
                  return filteredDepartments.map((dept) => (
                    <Fragment key={dept.id}>
                      <tr className="bg-slate-800">
                        <td
                          colSpan={18}
                          className="px-3 py-2 font-bold text-blue-300 text-xs uppercase tracking-wide border-b border-slate-700/80 bg-slate-800"
                        >
                          <span className="sticky left-3 inline-block">{dept.name}</span>
                        </td>
                      </tr>
                      {dept.members.map((member: any) => {
                        const { scores, avg, count, rank } = getMemberSummary(member);
                        const isCappedToB = avg != null && avg >= 90 && count < minMonthsForA;
                        return (
                          <tr key={member.id} className="group hover:bg-slate-800/40 transition-colors">
                            <td className="sticky left-0 z-20 bg-slate-900 group-hover:bg-slate-800 table-td text-center text-xs text-slate-400 border-r border-b border-slate-800 px-1 py-2 w-[42px] min-w-[42px]">
                              {stt++}
                            </td>
                            <td className="sticky left-[42px] z-20 bg-slate-900 group-hover:bg-slate-800 table-td font-medium text-xs sm:text-sm text-white border-r border-b border-slate-800 px-2.5 py-2 w-[190px] min-w-[190px] whitespace-normal break-words leading-snug">
                              {member.full_name}
                            </td>
                            <td className="sticky left-[232px] z-20 bg-slate-900 group-hover:bg-slate-800 table-td text-xs text-slate-300 border-r-2 border-b border-slate-700 px-2.5 py-2 w-[155px] min-w-[155px] whitespace-normal break-words leading-snug shadow-[2px_0_6px_rgba(0,0,0,0.35)]">
                              {member.title}
                            </td>
                            {scores.map((s, idx) => (
                              <td
                                key={idx}
                                className={`table-td text-center text-xs border-r border-b border-slate-800 px-1 py-2 ${
                                  s.isRejected ? 'text-amber-300 font-semibold' : 'text-slate-200'
                                }`}
                                title={s.isRejected ? 'Điểm do BCH Đoàn chấm lại' : undefined}
                              >
                                {s.score != null ? s.score : <span className="text-slate-600">-</span>}
                              </td>
                            ))}
                            <td className="table-td text-center font-bold text-xs text-blue-300 border-r border-b border-slate-800 px-1 py-2 whitespace-nowrap">
                              {avg != null ? avg : <span className="text-slate-600">-</span>}
                            </td>
                            <td className="table-td text-center border-r border-b border-slate-800 px-1 py-2 whitespace-nowrap">
                              {avg != null ? (
                                <span
                                  className={`badge ${rank.class} text-[10px] px-1.5 py-0.5`}
                                  title={
                                    isCappedToB
                                      ? `Điểm TB ≥ 90 nhưng mới có ${count}/12 tháng (< ${minMonthsForA} tháng) nên xếp tối đa HTTNV`
                                      : `${count}/12 tháng có điểm`
                                  }
                                >
                                  {rank.text}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">-</span>
                              )}
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
                  ));
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Popup Xếp hạng điểm trung bình (đủ 12 tháng) */}
      {showTopModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="glass-panel w-full max-w-4xl max-h-[86vh] flex flex-col border border-slate-700/80 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Trophy size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Bảng xếp hạng điểm trung bình năm {selectedYear}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Chỉ tính đoàn viên có đủ <strong className="text-amber-300">12/12 tháng</strong> đánh giá (&gt; 0 điểm) từ T12/{selectedYear - 1} đến T11/{selectedYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTopModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-900/50 border-b border-slate-800 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-slate-400">Số người:</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Tất cả"
                    className="w-14 bg-transparent text-xs font-semibold text-white text-center focus:outline-none"
                    value={topLimit === 'all' ? '' : topLimit}
                    onChange={(e) => setTopLimit(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-1">
                  {['5', '10', '15', '20', 'all'].map((preset) => {
                    const active = topLimit === preset;
                    return (
                      <button
                        key={preset}
                        onClick={() => setTopLimit(preset)}
                        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                          active
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {preset === 'all' ? 'Tất cả' : `Top ${preset}`}
                      </button>
                    );
                  })}
                </div>

                <select
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs max-w-[200px] focus:outline-none focus:border-amber-500"
                  value={topDeptFilter}
                  onChange={(e) => setTopDeptFilter(e.target.value)}
                >
                  <option value="all">Tất cả chi đoàn</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setTopSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-colors"
                  title="Đổi thứ tự sắp xếp"
                >
                  <ArrowUpDown size={13} />
                  {topSortOrder === 'desc' ? 'Cao → Thấp' : 'Thấp → Cao'}
                </button>
              </div>

              <button
                onClick={exportTopRankingExcel}
                disabled={displayedRanking.length === 0}
                className="btn btn-secondary py-1 px-3 text-xs disabled:opacity-50"
              >
                <FileDown size={14} />
                Xuất Excel Top
              </button>
            </div>

            {/* Eligible summary */}
            <div className="px-5 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>
                Đủ điều kiện (12/12 tháng):{' '}
                <strong className="text-emerald-400">{eligibleRanking.length}</strong> / {members.length} đoàn viên
              </span>
              <span>
                Đang hiển thị: <strong className="text-white">{displayedRanking.length}</strong> người
              </span>
            </div>

            {/* Modal Table */}
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700">
                  <tr>
                    <th className="table-th text-center w-14 text-xs py-2.5">Hạng</th>
                    <th className="table-th text-xs py-2.5">Họ và tên</th>
                    <th className="table-th text-xs py-2.5">Chức danh</th>
                    <th className="table-th text-xs py-2.5">Chi đoàn</th>
                    <th className="table-th text-center text-xs py-2.5 w-24">Thấp – Cao</th>
                    <th className="table-th text-center text-xs py-2.5 w-24">Điểm TB</th>
                    <th className="table-th text-center text-xs py-2.5 w-24">Đánh giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {displayedRanking.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                        Chưa có đoàn viên nào có đủ 12/12 tháng đánh giá trong năm {selectedYear}.
                      </td>
                    </tr>
                  ) : (
                    displayedRanking.map((item, idx) => {
                      const rankNum = idx + 1;
                      const medalClass =
                        topSortOrder === 'desc' && rankNum === 1
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                          : topSortOrder === 'desc' && rankNum === 2
                          ? 'bg-slate-300/20 text-slate-200 border-slate-300/40'
                          : topSortOrder === 'desc' && rankNum === 3
                          ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700';

                      return (
                        <tr key={item.member.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="table-td text-center py-2.5">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${medalClass}`}
                            >
                              {rankNum}
                            </span>
                          </td>
                          <td className="table-td font-semibold text-sm text-white py-2.5">
                            {item.member.full_name}
                          </td>
                          <td className="table-td text-xs text-slate-300 py-2.5">
                            {item.member.title}
                          </td>
                          <td className="table-td text-xs text-slate-400 py-2.5">
                            {item.departmentName}
                          </td>
                          <td className="table-td text-center text-xs text-slate-400 py-2.5">
                            {item.minScore} – {item.maxScore}
                          </td>
                          <td className="table-td text-center font-bold text-sm text-amber-300 py-2.5">
                            {item.avg}
                          </td>
                          <td className="table-td text-center py-2.5">
                            <span className={`badge ${item.rank.class} text-[11px] px-2 py-0.5`}>
                              {item.rank.text}
                            </span>
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
      )}
    </div>
  );
}


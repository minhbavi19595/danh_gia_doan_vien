'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Save, UserPlus, RefreshCw, X, FileDown, Zap, Check, ArrowRightLeft, Search } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { sortMembersByTitle } from '@/lib/sortMembers';
import { getMaxEvaluationPeriod, getAvailableYears, getAvailableMonths } from '@/lib/evaluationPeriod';
import CustomSelect from '@/components/CustomSelect';

export default function DepartmentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { maxYear, maxMonth } = getMaxEvaluationPeriod();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string>('');
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Year & Month selector (mặc định mở theo kỳ mới nhất: từ ngày 24 mở tháng sau)
  const [currentYear, setCurrentYear] = useState(maxYear);
  const [currentMonth, setCurrentMonth] = useState(maxMonth);

  // Add member modal state
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ full_name: '', title: '' });

  // Edit & Transfer state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMemberForm, setEditMemberForm] = useState({ id: '', full_name: '', title: '' });
  
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMemberId, setTransferMemberId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<any[]>([]);
  const [outgoingTransfers, setOutgoingTransfers] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMembers = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase();
    if (!kw) return members;
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(kw) ||
        m.title?.toLowerCase().includes(kw)
    );
  }, [members, searchTerm]);

  useEffect(() => {
    if (user?.id) {
      fetchDepartmentInfo();
    }
  }, [user?.id]);

  useEffect(() => {
    if (departmentId) {
      fetchData();
    }
  }, [departmentId, currentYear, currentMonth]);

  const fetchDepartmentInfo = async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('user_id', user?.id)
      .single();
    if (data) {
      setDepartmentId(data.id);
      setDepartmentName(data.name);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: membersData } = await supabase
        .from('members')
        .select('*')
        .eq('department_id', departmentId)
        .order('created_at', { ascending: true });
      
      setMembers(sortMembersByTitle(membersData || []));

      const { data: allDepts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name', { ascending: true });
      setAllDepartments(allDepts || []);

      // Tải các yêu cầu chuyển chi đoàn đang chờ xác nhận (chiều đến và chiều đi)
      const { data: pendingReqs } = await supabase
        .from('member_transfer_requests')
        .select('id, member_id, from_department_id, to_department_id, status, created_at, members(full_name, title)')
        .eq('status', 'pending')
        .or(`from_department_id.eq.${departmentId},to_department_id.eq.${departmentId}`)
        .order('created_at', { ascending: false });

      const deptMap: Record<string, string> = {};
      (allDepts || []).forEach((d) => {
        deptMap[d.id] = d.name;
      });

      const incoming: any[] = [];
      const outgoingMap: Record<string, any> = {};
      (pendingReqs || []).forEach((req: any) => {
        const enriched = {
          ...req,
          from_department_name: deptMap[req.from_department_id] || 'Chi đoàn cũ',
          to_department_name: deptMap[req.to_department_id] || 'Chi đoàn mới',
        };
        if (req.to_department_id === departmentId) {
          incoming.push(enriched);
        }
        if (req.from_department_id === departmentId) {
          outgoingMap[req.member_id] = enriched;
        }
      });
      setIncomingTransfers(incoming);
      setOutgoingTransfers(outgoingMap);

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

  const checkDuplicateNameAndConfirm = async (fullName: string, excludeMemberId?: string) => {
    const cleanName = fullName.trim().replace(/\s+/g, ' ');
    const norm = cleanName.normalize('NFC').toLowerCase();

    let duplicates: { full_name: string; department_name: string }[] = [];

    try {
      const { data, error } = await supabase.rpc('check_duplicate_member_name', {
        p_full_name: cleanName,
        p_exclude_member_id: excludeMemberId || null,
      });
      if (!error && Array.isArray(data)) {
        duplicates = data;
      }
    } catch {
      // Fallback kiểm tra cục bộ trong chi đoàn hiện tại nếu DB chưa chạy RPC
    }

    if (duplicates.length === 0) {
      const localDups = members.filter(
        (m) =>
          m.id !== excludeMemberId &&
          String(m.full_name || '')
            .normalize('NFC')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase() === norm
      );
      if (localDups.length > 0) {
        duplicates = localDups.map((m) => ({
          full_name: m.full_name,
          department_name: departmentName || 'Chi đoàn hiện tại',
        }));
      }
    }

    if (duplicates.length === 0) return true;

    const deptList = Array.from(new Set(duplicates.map((d) => d.department_name))).join(', ');
    return await toast.confirm(
      `Cảnh báo trùng tên: "${cleanName}" đã tồn tại tại ${deptList}.\nBạn nên thêm ký tự phân biệt (VD: "${cleanName} A" hoặc "${cleanName} B") để tránh nhầm lẫn khi tổng hợp.\n\nBạn vẫn muốn giữ nguyên tên này?`
    );
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanName = memberForm.full_name.trim().replace(/\s+/g, ' ');
      const ok = await checkDuplicateNameAndConfirm(cleanName);
      if (!ok) return;

      const { error } = await supabase
        .from('members')
        .insert([{
          department_id: departmentId,
          full_name: cleanName,
          title: memberForm.title.trim() || 'Đoàn viên'
        }]);
      
      if (error) throw error;
      setShowMemberModal(false);
      setMemberForm({ full_name: '', title: '' });
      toast.success('Thêm đoàn viên thành công!');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanName = editMemberForm.full_name.trim().replace(/\s+/g, ' ');
      const ok = await checkDuplicateNameAndConfirm(cleanName, editMemberForm.id);
      if (!ok) return;

      const { error } = await supabase
        .from('members')
        .update({
          full_name: cleanName,
          title: editMemberForm.title
        })
        .eq('id', editMemberForm.id);
      
      if (error) throw error;
      toast.success('Cập nhật thông tin thành công!');
      setShowEditModal(false);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleTransferMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDepartmentId) {
      toast.error('Vui lòng chọn chi đoàn chuyển đến');
      return;
    }
    
    try {
      const { error } = await supabase.rpc('request_member_transfer', {
        p_member_id: transferMemberId,
        p_target_department_id: targetDepartmentId
      });
        
      if (error) throw error;
      toast.success('Đã gửi yêu cầu chuyển sinh hoạt! Đang chờ Bí thư Chi đoàn mới xác nhận.');
      setShowTransferModal(false);
      setTransferMemberId('');
      setTargetDepartmentId('');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleRespondTransfer = async (req: any, approve: boolean) => {
    const memberName = req.members?.full_name || 'đoàn viên này';
    const confirmed = await toast.confirm(
      approve
        ? `Xác nhận tiếp nhận "${memberName}" từ ${req.from_department_name}?\nToàn bộ dữ liệu điểm các tháng trước sẽ được chuyển sang chi đoàn của bạn.`
        : `Từ chối tiếp nhận "${memberName}" từ ${req.from_department_name}?\nĐoàn viên này sẽ tiếp tục ở lại chi đoàn cũ.`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('respond_member_transfer', {
        p_request_id: req.id,
        p_approve: approve,
      });
      if (error) throw error;
      toast.success(
        approve
          ? `Đã tiếp nhận "${memberName}" vào chi đoàn!`
          : `Đã từ chối yêu cầu chuyển "${memberName}".`
      );
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi xử lý yêu cầu: ' + (err.message || 'Không xác định'));
    }
  };

  const handleCancelTransfer = async (req: any, memberName: string) => {
    const confirmed = await toast.confirm(
      `Hủy yêu cầu chuyển "${memberName}" sang ${req.to_department_name}?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('cancel_member_transfer', {
        p_request_id: req.id,
      });
      if (error) throw error;
      toast.info(`Đã hủy yêu cầu chuyển "${memberName}".`);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi khi hủy yêu cầu: ' + (err.message || 'Không xác định'));
    }
  };

  const handleScoreChange = (memberId: string, field: string, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    setEvaluations(prev => {
      const current = prev[memberId] || { 
        score_1: 0, score_2: 0, score_3: 0, score_4: 0, score_5: 0, note: '' 
      };
      
      const updated = { ...current, [field]: field === 'note' ? value : numValue };
      if (field !== 'note') {
        updated.total_score = (updated.score_1||0) + (updated.score_2||0) + (updated.score_3||0) + (updated.score_4||0) + (updated.score_5||0);
      }
      return { ...prev, [memberId]: updated };
    });
  };

  const handleQuickFillScores = () => {
    if (members.length === 0) {
      toast.info('Chi đoàn chưa có đoàn viên nào!');
      return;
    }

    setEvaluations(prev => {
      const next = { ...prev };
      members.forEach(member => {
        const current = next[member.id] || { note: '' };
        next[member.id] = {
          ...current,
          score_1: 20,
          score_2: 20,
          score_3: 19,
          score_4: 10,
          score_5: 20,
          total_score: 89,
        };
      });
      return next;
    });

    toast.success('Đã điền nhanh điểm (20 - 20 - 19 - 10 - 20) cho toàn bộ đoàn viên. Bấm "Lưu đánh giá" để lưu!');
  };

  const saveEvaluations = async () => {
    setSaving(true);
    try {
      const upsertData = Object.entries(evaluations).map(([memberId, ev]) => {
        const row: any = {
          member_id: memberId,
          department_id: departmentId,
          year: currentYear,
          month: currentMonth,
          score_1: ev.score_1 || 0,
          score_2: ev.score_2 || 0,
          score_3: ev.score_3 || 0,
          score_4: ev.score_4 || 0,
          score_5: ev.score_5 || 0,
          note: ev.note || ''
        };
        return row;
      });

      if (upsertData.length > 0) {
        const { error } = await supabase
          .from('evaluations')
          .upsert(upsertData, { onConflict: 'member_id, year, month' });
        
        if (error) throw error;
        toast.success('Lưu đánh giá thành công!');
        fetchData();
      }
    } catch (err: any) {
      toast.error('Lỗi khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getRank = (score: number | null | undefined) => {
    if (score == null || score <= 0) return { text: '-', class: '' };
    if (score >= 90) return { text: 'HTXSNV', class: 'badge-a' };
    if (score >= 70) return { text: 'HTTNV', class: 'badge-b' };
    if (score >= 50) return { text: 'HTNV', class: 'badge-c' };
    return { text: 'KHTNV', class: 'badge-d' };
  };

  // ============ EXPORT EXCEL ============
  const exportExcel = () => {
    try {
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

      // Row 3: Đơn vị & Tên Chi đoàn
      const deptTitle = (departmentName || 'CHI ĐOÀN').toUpperCase();
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
      deptRow[0] = departmentName.toUpperCase();
      rows.push(deptRow);
      rowHeights.push({ hpt: 26 });
      merges.push({ s: { r: deptRowIdx, c: 0 }, e: { r: deptRowIdx, c: 12 } });

      // Dòng dữ liệu đoàn viên
      const dataRowIndices: number[] = [];
      let countA = 0, countB = 0, countC = 0, countD = 0;

      members.forEach((member, index) => {
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
          index + 1,
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
      summaryRow[0] = `Tổng số: ${members.length} đoàn viên. Trong đó: Xếp loại A: ${countA}; Xếp loại B: ${countB}; Xếp loại C: ${countC}; Xếp loại D: ${countD}`;
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
      XLSX.writeFile(wb, `Đánh giá đoàn viên ${departmentName} - T${currentMonth}.${currentYear}.xlsx`);
      toast.success('Xuất file Excel thành công!');
    } catch (err: any) {
      toast.error('Lỗi khi xuất Excel: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="w-48 h-8 bg-slate-800/50 rounded mb-2"></div>
            <div className="flex gap-3">
              <div className="w-32 h-8 bg-slate-800/50 rounded-lg"></div>
              <div className="w-32 h-8 bg-slate-800/50 rounded-lg"></div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-24 h-10 bg-slate-800/50 rounded border border-slate-700/50"></div>
            <div className="w-32 h-10 bg-slate-800/50 rounded border border-slate-700/50"></div>
            <div className="w-24 h-10 bg-slate-800/50 rounded border border-slate-700/50"></div>
          </div>
        </div>
        
        <div className="glass-panel border border-slate-700/50 flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
          <div className="h-12 bg-slate-900 border-b border-slate-700/50"></div>
          <div className="h-10 bg-slate-900 border-b border-slate-700/50"></div>
          <div className="p-2 space-y-2 flex-1">
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Đánh giá Đoàn viên</h1>
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
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên, chức danh..."
                className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-9 pr-8 py-1.5 w-48 sm:w-56 text-sm focus:outline-none focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  title="Xóa từ khóa"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-secondary" onClick={() => setShowMemberModal(true)}>
            <UserPlus size={18} />
            Thêm Đoàn viên
          </button>
          <button className="btn btn-secondary" onClick={handleQuickFillScores} disabled={members.length === 0}>
            <Zap size={18} />
            Điền nhanh
          </button>
          <button className="btn btn-secondary" onClick={exportExcel}>
            <FileDown size={18} />
            Xuất báo cáo
          </button>
          <button className="btn btn-primary shadow-blue-500/20" onClick={saveEvaluations} disabled={saving}>
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Lưu đánh giá
          </button>
        </div>
      </div>

      {/* Danh sách yêu cầu chuyển đoàn viên đến chi đoàn mình chờ xác nhận */}
      {incomingTransfers.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
            <ArrowRightLeft size={18} />
            <span>
              Có {incomingTransfers.length} yêu cầu chuyển đoàn viên sang chi đoàn của bạn chờ xác nhận
            </span>
          </div>
          <div className="space-y-2">
            {incomingTransfers.map((req) => (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/70 border border-slate-700/70 rounded-lg px-3 py-2.5"
              >
                <div className="text-sm">
                  <span className="font-semibold text-white">{req.members?.full_name || 'Đoàn viên'}</span>
                  <span className="text-slate-400 text-xs ml-2">({req.members?.title || 'Đoàn viên'})</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Chuyển từ: <strong className="text-amber-200">{req.from_department_name}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRespondTransfer(req, true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                  >
                    <Check size={14} />
                    Xác nhận tiếp nhận
                  </button>
                  <button
                    onClick={() => handleRespondTransfer(req, false)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 transition-colors"
                  >
                    <X size={14} />
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-panel overflow-hidden border border-slate-700/50 shadow-2xl flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-md">
              <tr>
                <th rowSpan={2} className="table-th text-center w-10 border-r border-slate-700/50 text-xs p-1">STT</th>
                <th rowSpan={2} className="table-th w-32 border-r border-slate-700/50 text-xs p-1">Họ và tên</th>
                <th rowSpan={2} className="table-th w-24 border-r border-slate-700/50 text-xs p-1">Chức danh</th>
                <th colSpan={5} className="table-th text-center border-r border-slate-700/50 bg-slate-800/50">Các tiêu chí đánh giá (Nhập điểm)</th>
                <th colSpan={2} className="table-th text-center border-r border-slate-700/50 bg-blue-500/10 text-blue-200">Chi đoàn đánh giá</th>
                <th rowSpan={2} className="table-th min-w-[150px]">Ghi chú</th>
                <th rowSpan={2} className="table-th text-center w-16">Thao tác</th>
              </tr>
              <tr>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Lý tưởng cách mạng, nhận thức chính trị">Lý tưởng<br/>nhận thức</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Đạo đức, lối sống, tác phong đoàn viên">Đạo đức<br/>lối sống</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Công tác chuyên môn nghiệp vụ">Chuyên môn<br/>nghiệp vụ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Rèn luyện sức khoẻ">Rèn luyện<br/>sức khoẻ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn">Ý thức<br/>phong trào</th>
                
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/5">Tổng<br/>điểm</th>
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/5">Mức<br/>xếp loại</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center p-12 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr><td colSpan={12} className="text-center p-12 text-slate-400">
                  {searchTerm.trim() ? 'Không tìm thấy đoàn viên nào phù hợp.' : 'Chưa có đoàn viên nào trong chi đoàn. Hãy bấm "Thêm Đoàn viên" để thêm mới.'}
                </td></tr>
              ) : (
                filteredMembers.map((member, index) => {
                  const ev = evaluations[member.id] || {};
                  const total = ev.total_score ?? 0;
                  const bchTotal = ev.status === 'rejected' ? ev.bch_total_score : total;
                  const rank = getRank(ev.id || ev.total_score !== undefined ? total : null);
                  const bchRank = getRank(ev.id || ev.total_score !== undefined ? bchTotal : null);
                  const isLocked = ev.status === 'approved' || ev.status === 'rejected';
                  
                  const isRejected = ev.status === 'rejected';
                  
                  return (
                    <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="table-td text-center border-r border-slate-700/50 text-slate-400 p-1">{index + 1}</td>
                      <td className="table-td font-medium border-r border-slate-700/50 text-white p-1 text-sm">
                        <div>{member.full_name}</div>
                        {outgoingTransfers[member.id] && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Chờ chuyển → {outgoingTransfers[member.id].to_department_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCancelTransfer(outgoingTransfers[member.id], member.full_name)}
                              className="text-[10px] text-slate-400 hover:text-red-400 underline"
                              title="Hủy yêu cầu chuyển chi đoàn"
                            >
                              Hủy
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="table-td text-slate-400 border-r border-slate-700/50 p-1 text-xs">{member.title}</td>
                      
                      {/* Tiêu chí */}
                      {[
                        { field: 'score_1', val: isRejected ? ev.bch_score_1 : ev.score_1, old: ev.score_1 },
                        { field: 'score_2', val: isRejected ? ev.bch_score_2 : ev.score_2, old: ev.score_2 },
                        { field: 'score_3', val: isRejected ? ev.bch_score_3 : ev.score_3, old: ev.score_3 },
                        { field: 'score_4', val: isRejected ? ev.bch_score_4 : ev.score_4, old: ev.score_4 },
                        { field: 'score_5', val: isRejected ? ev.bch_score_5 : ev.score_5, old: ev.score_5 },
                      ].map((col, idx) => (
                        <td key={idx} className="p-1 border-b border-slate-700/50 border-r relative">
                          <input 
                            type="number" min="0" max="100" 
                            className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50" 
                            disabled={isLocked} 
                            value={col.val ?? ''} 
                            onChange={e => handleScoreChange(member.id, col.field, e.target.value)} 
                          />
                          {isRejected && col.val !== col.old && (
                            <span className="absolute -top-1 -right-0 text-[11px] text-slate-500 line-through" title="Điểm bạn chấm ban đầu">{col.old}</span>
                          )}
                        </td>
                      ))}
                      
                      {/* Chi đoàn */}
                      <td className="table-td text-center border-r border-slate-700/50 font-bold text-sm bg-blue-500/5 p-1 relative">
                        {ev.id || ev.total_score !== undefined ? (isRejected ? bchTotal : total) : '-'}
                        {isRejected && bchTotal !== total && (
                          <span className="absolute top-0 right-1 text-[11px] text-slate-500 line-through" title="Điểm bạn chấm ban đầu">{total}</span>
                        )}
                        {isRejected && <div className="text-[9px] text-amber-400 mt-1">BCH chấm lại</div>}
                      </td>
                      <td className="table-td text-center border-r border-slate-700/50 bg-blue-500/5 p-1 relative">
                        <span className={`badge ${isRejected ? bchRank.class : rank.class} text-[10px] px-1 py-0.5`}>
                          {isRejected ? bchRank.text : rank.text}
                        </span>
                        {isRejected && bchRank.text !== rank.text && (
                          <span className="absolute top-0 right-1 text-[11px] text-slate-500 line-through" title="Xếp loại ban đầu">{rank.text}</span>
                        )}
                      </td>
                      
                      {/* Ghi chú */}
                      <td className="p-1 border-b border-slate-700/50"><input type="text" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50" disabled={isLocked} value={ev.note ?? ''} onChange={e => handleScoreChange(member.id, 'note', e.target.value)} placeholder={!(ev.id || ev.total_score !== undefined) ? 'Đoàn viên mới' : '...'} /></td>
                      
                      {/* Thao tác */}
                      <td className="table-td text-center border-b border-slate-700/50 p-1">
                        <div className="flex items-center justify-center gap-1">
                          <button className="text-slate-400 hover:text-blue-400 p-1" title="Sửa tên" onClick={() => {
                            setEditMemberForm({ id: member.id, full_name: member.full_name, title: member.title });
                            setShowEditModal(true);
                          }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                          </button>
                          <button className="text-slate-400 hover:text-orange-400 p-1" title="Chuyển chi đoàn" onClick={() => {
                            setTransferMemberId(member.id);
                            setShowTransferModal(true);
                          }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm Đoàn viên */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Thêm Đoàn viên mới</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowMemberModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Họ và tên</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={memberForm.full_name}
                  onChange={e => setMemberForm({...memberForm, full_name: e.target.value})}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Chức danh</label>
                <CustomSelect
                  size="md"
                  placeholder="Chọn chức danh"
                  value={memberForm.title}
                  onChange={(val) => setMemberForm({ ...memberForm, title: val })}
                  options={[
                    { value: 'Bí Thư Đoàn Thanh Niên', label: 'Bí Thư Đoàn Thanh Niên' },
                    { value: 'Phó bí thư đoàn thanh niên', label: 'Phó bí thư đoàn thanh niên' },
                    { value: 'Ủy viên BCH Đoàn thanh niên trung tâm', label: 'Ủy viên BCH Đoàn thanh niên trung tâm' },
                    { value: 'Bí thư chi đoàn', label: 'Bí thư chi đoàn' },
                    { value: 'Phó bí thư chi đoàn', label: 'Phó bí thư chi đoàn' },
                    { value: 'Ủy viên BCH chi đoàn', label: 'Ủy viên BCH chi đoàn' },
                    { value: 'Đoàn viên', label: 'Đoàn viên' },
                  ]}
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowMemberModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Thêm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import Excel removed from here */}
      {/* Modal Chỉnh sửa đoàn viên */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Chỉnh sửa Đoàn viên</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Họ và tên</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={editMemberForm.full_name}
                  onChange={e => setEditMemberForm({...editMemberForm, full_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Chức danh</label>
                <CustomSelect
                  size="md"
                  placeholder="Chọn chức danh"
                  value={editMemberForm.title}
                  onChange={(val) => setEditMemberForm({ ...editMemberForm, title: val })}
                  options={[
                    { value: 'Bí Thư Đoàn Thanh Niên', label: 'Bí Thư Đoàn Thanh Niên' },
                    { value: 'Phó bí thư đoàn thanh niên', label: 'Phó bí thư đoàn thanh niên' },
                    { value: 'Ủy viên BCH Đoàn thanh niên trung tâm', label: 'Ủy viên BCH Đoàn thanh niên trung tâm' },
                    { value: 'Bí thư chi đoàn', label: 'Bí thư chi đoàn' },
                    { value: 'Phó bí thư chi đoàn', label: 'Phó bí thư chi đoàn' },
                    { value: 'Ủy viên BCH chi đoàn', label: 'Ủy viên BCH chi đoàn' },
                    { value: 'Đoàn viên', label: 'Đoàn viên' },
                  ]}
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu thay đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chuyển chi đoàn */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Chuyển sinh hoạt đoàn</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowTransferModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleTransferMember} className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm mb-4">
                <strong>Lưu ý:</strong> Yêu cầu sẽ được gửi tới Chi đoàn đích. Khi Bí thư Chi đoàn mới xác nhận tiếp nhận, đoàn viên cùng toàn bộ dữ liệu điểm các tháng trước sẽ chuyển sang Chi đoàn mới. Nếu từ chối hoặc chưa xử lý, đoàn viên vẫn thuộc Chi đoàn hiện tại.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Chi đoàn chuyển đến</label>
                <CustomSelect
                  size="md"
                  placeholder="-- Chọn Chi đoàn mới --"
                  value={targetDepartmentId}
                  onChange={(val) => setTargetDepartmentId(val)}
                  options={allDepartments
                    .filter((d) => d.id !== departmentId)
                    .map((dept) => ({ value: dept.id, label: dept.name }))}
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 border-transparent">Xác nhận chuyển</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

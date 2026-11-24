'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, Save, UserPlus, RefreshCw, X, FileDown, FileUp, Upload, Download, Zap } from 'lucide-react';
import XLSX from 'xlsx-js-style';

export default function DepartmentDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string>('');
  const [members, setMembers] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Year & Month selector
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Modal
  const [newMemberTitle, setNewMemberTitle] = useState('');
  
  // Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberModalTab, setMemberModalTab] = useState<'manual'|'excel'>('manual');
  const [memberForm, setMemberForm] = useState({ full_name: '', title: '' });

  // Edit & Transfer state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMemberForm, setEditMemberForm] = useState({ id: '', full_name: '', title: '' });
  
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMemberId, setTransferMemberId] = useState('');
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [allDepartments, setAllDepartments] = useState<any[]>([]);

  // Import modal data
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      
      setMembers(membersData || []);

      const { data: allDepts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name', { ascending: true });
      setAllDepartments(allDepts || []);

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

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('members')
        .insert([{
          department_id: departmentId,
          full_name: memberForm.full_name.trim(),
          title: memberForm.title.trim() || 'Đoàn viên'
        }]);
      
      if (error) throw error;
      setShowMemberModal(false);
      setMemberForm({ full_name: '', title: '' });
      toast.success('Thêm đoàn viên thành công (tự động đồng bộ lịch sử điểm nếu chuyển từ chi đoàn khác)!');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('members')
        .update({
          full_name: editMemberForm.full_name,
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
      const { error } = await supabase.rpc('transfer_member', {
        p_member_id: transferMemberId,
        p_target_department_id: targetDepartmentId
      });
        
      if (error) throw error;
      toast.success('Đã chuyển sinh hoạt đoàn thành công!');
      setShowTransferModal(false);
      setTransferMemberId('');
      setTargetDepartmentId('');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
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

  // ============ DOWNLOAD TEMPLATES ============
  const downloadTemplateAdd = () => {
    const wb = XLSX.utils.book_new();
    const templateData = [
      ['Họ và tên', 'Chức danh', 'Lý tưởng cách mạng, nhận thức chính trị', 'Đạo đức, lối sống, tác phong đoàn viên', 'Công tác chuyên môn nghiệp vụ', 'Rèn luyện sức khoẻ', 'Ý thức xây dựng tổ chức đoàn', 'Ghi chú'],
      ['Nguyễn Văn A', 'Bí thư', '', '', '', '', '', ''],
      ['Trần Thị B', 'Phó Bí thư', '', '', '', '', '', ''],
      ['Lê Văn C', 'Đoàn viên', '', '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
    XLSX.writeFile(wb, 'Mau_Them_Moi_Doan_Vien.xlsx');
    toast.info('Đã tải file mẫu thêm mới!');
  };

  const downloadTemplateGrade = () => {
    if (members.length === 0) {
      toast.info('Chi đoàn chưa có đoàn viên nào!');
      return;
    }
    const wb = XLSX.utils.book_new();
    const templateData = [
      ['Họ và tên', 'Chức danh', 'Lý tưởng cách mạng, nhận thức chính trị', 'Đạo đức, lối sống, tác phong đoàn viên', 'Công tác chuyên môn nghiệp vụ', 'Rèn luyện sức khoẻ', 'Ý thức xây dựng tổ chức đoàn', 'Ghi chú']
    ];
    
    members.forEach(m => {
      templateData.push([m.full_name, m.title, '', '', '', '', '', '']);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
    XLSX.writeFile(wb, 'Mau_Cham_Diem_Doan_Vien.xlsx');
    toast.info('Đã tải danh sách để chấm điểm!');
  };

  const processExcelMembersAndScores = (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

        let headerRowIdx = -1;
        let sttCol = -1;
        let nameCol = -1;
        let titleCol = -1;
        let s1Col = -1;
        let s2Col = -1;
        let s3Col = -1;
        let s4Col = -1;
        let s5Col = -1;
        let noteCol = -1;

        for (let i = 0; i < Math.min(15, jsonData.length); i++) {
          const row = jsonData[i] || [];
          for (let j = 0; j < row.length; j++) {
            const cellVal = String(row[j] || '').normalize('NFC').toLowerCase().trim();
            if (cellVal.includes('họ') && cellVal.includes('tên')) {
              headerRowIdx = i;
              nameCol = j;
              break;
            }
          }
          if (headerRowIdx >= 0) break;
        }

        if (headerRowIdx < 0 || nameCol < 0) {
          toast.error('Không tìm thấy cột "Họ và tên" trong file Excel.');
          return;
        }

        const headerRow = jsonData[headerRowIdx] || [];
        const subHeaderRow = jsonData[headerRowIdx + 1] || [];
        let totalCol = -1;
        const maxCols = Math.max(headerRow.length, subHeaderRow.length);

        for (let j = 0; j < maxCols; j++) {
          const h = String(headerRow[j] || '').normalize('NFC').toLowerCase().trim();
          const h2 = String(subHeaderRow[j] || '').normalize('NFC').toLowerCase().trim();
          if (h === 'stt' || h === 'tt') sttCol = j;
          else if (h.includes('chức danh') || h.includes('chức vụ')) titleCol = j;
          else if (h.includes('lý tưởng') || h === 'tc1') s1Col = j;
          else if (h.includes('đạo đức') || h === 'tc2') s2Col = j;
          else if (h.includes('chuyên môn') || h === 'tc3') s3Col = j;
          else if (h.includes('sức khoẻ') || h.includes('sức khỏe') || h === 'tc4') s4Col = j;
          else if (h.includes('ý thức') || h.includes('phong trào') || h === 'tc5') s5Col = j;
          else if (h.includes('ghi chú')) noteCol = j;

          if ((h.includes('tổng điểm') || h2.includes('tổng điểm')) && totalCol < 0) {
            totalCol = j;
          }
        }

        if (titleCol < 0) titleCol = nameCol + 1;
        if (s1Col < 0) s1Col = titleCol + 1;
        if (s2Col < 0) s2Col = titleCol + 2;
        if (s3Col < 0) s3Col = titleCol + 3;
        if (s4Col < 0) s4Col = titleCol + 4;
        if (s5Col < 0) s5Col = titleCol + 5;
        if (noteCol < 0) noteCol = titleCol + 6;

        const parseNum = (v: any) => {
          if (v === '' || v === null || v === undefined) return null;
          const n = Number(v);
          return isNaN(n) ? null : n;
        };

        const splitTotalTo5 = (total: number) => {
          if (total === 89) return { s1: 20, s2: 20, s3: 19, s4: 10, s5: 20 };
          const c1 = Math.min(20, total);
          const c2 = Math.min(20, Math.max(0, total - c1));
          const c3 = Math.min(20, Math.max(0, total - c1 - c2));
          const c4 = Math.min(15, Math.max(0, total - c1 - c2 - c3));
          const c5 = Math.max(0, total - c1 - c2 - c3 - c4);
          return { s1: c1, s2: c2, s3: c3, s4: c4, s5: c5 };
        };

        const stopPrefixes = [
          'tổng số',
          'tổng:',
          'nơi nhận',
          'đảng uỷ',
          'đảng ủy',
          'lưu:',
          'tm. bch',
        ];

        const skipPrefixes = [
          'các chi đoàn',
          'chi đoàn ',
          'bch đoàn',
          'hà nội,',
          'quảng oai,',
        ];

        const parsed: any[] = [];
        for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;

          const firstCellLow = String(row[0] || '').normalize('NFC').trim().toLowerCase();
          const rawName = String(row[nameCol] || '').normalize('NFC').trim();
          const lowerName = rawName.toLowerCase();

          // Gặp dòng tổng kết hoặc phần chữ ký cuối bảng thì dừng đọc ngay
          if (
            stopPrefixes.some((p) => firstCellLow.startsWith(p) || lowerName.startsWith(p))
          ) {
            break;
          }

          if (!rawName) continue;

          if (
            lowerName.includes('họ và tên') ||
            lowerName.includes('tổng điểm') ||
            lowerName.includes('mức xếp loại') ||
            skipPrefixes.some((p) => lowerName.startsWith(p))
          ) {
            continue;
          }

          const rawTitle = String(row[titleCol] || '').normalize('NFC').trim();
          let s1 = parseNum(row[s1Col]);
          let s2 = parseNum(row[s2Col]);
          let s3 = parseNum(row[s3Col]);
          let s4 = parseNum(row[s4Col]);
          let s5 = parseNum(row[s5Col]);
          let hasScores = s1 !== null || s2 !== null || s3 !== null || s4 !== null || s5 !== null;

          // Nếu file chỉ điền cột Tổng điểm mà để trống 5 cột tiêu chí
          if (!hasScores && totalCol >= 0) {
            const totVal = parseNum(row[totalCol]);
            if (totVal !== null && totVal >= 0) {
              const sp = splitTotalTo5(Math.round(totVal));
              s1 = sp.s1;
              s2 = sp.s2;
              s3 = sp.s3;
              s4 = sp.s4;
              s5 = sp.s5;
              hasScores = true;
            }
          }

          // Nếu dòng không có chức danh và cũng không có điểm -> bỏ qua (dòng tiêu đề nhóm / dòng trống)
          if (!rawTitle && !hasScores) {
            continue;
          }

          if (sttCol >= 0) {
            const sttVal = parseNum(row[sttCol]);
            if (sttVal === null && !rawTitle && !hasScores) {
              continue;
            }
          }

          parsed.push({
            full_name: rawName,
            title: rawTitle || 'Đoàn viên',
            score_1: s1,
            score_2: s2,
            score_3: s3,
            score_4: s4,
            score_5: s5,
            hasScores,
            note: noteCol >= 0 ? String(row[noteCol] || '').trim() : '',
          });
        }

        if (parsed.length === 0) {
          toast.error('Không tìm thấy dữ liệu đoàn viên hợp lệ trong file Excel.');
          return;
        }

        try {
          setLoading(true);
          const normalizeName = (s: string) =>
            String(s || '')
              .normalize('NFC')
              .trim()
              .replace(/\s+/g, ' ')
              .toLowerCase();

          const existingMembersMap = new Map<string, any>();
          members.forEach((m) => existingMembersMap.set(normalizeName(m.full_name), m));

          // 1. Phân loại tên mới (chưa có trong chi đoàn) để thêm mới, hoặc tên cũ đổi chức danh để cập nhật chức danh mới
          const missingMembers: { full_name: string; title: string }[] = [];
          const titleUpdates: { id: string; title: string }[] = [];
          const seenMissing = new Set<string>();
          const seenTitleUpdate = new Set<string>();

          parsed.forEach((item) => {
            const nameKey = normalizeName(item.full_name);
            if (!nameKey) return;
            const existing = existingMembersMap.get(nameKey);
            if (!existing && !seenMissing.has(nameKey)) {
              seenMissing.add(nameKey);
              missingMembers.push({
                full_name: item.full_name,
                title: item.title || 'Đoàn viên',
              });
            } else if (
              existing &&
              item.title &&
              item.title !== existing.title &&
              !seenTitleUpdate.has(existing.id)
            ) {
              seenTitleUpdate.add(existing.id);
              titleUpdates.push({ id: existing.id, title: item.title });
            }
          });

          if (missingMembers.length > 0) {
            const insertRows = missingMembers.map((item) => ({
              department_id: departmentId,
              full_name: item.full_name,
              title: item.title,
            }));
            const { error: insertErr } = await supabase.from('members').insert(insertRows);
            if (insertErr) throw insertErr;
          }

          if (titleUpdates.length > 0) {
            await Promise.all(
              titleUpdates.map((u) =>
                supabase.from('members').update({ title: u.title }).eq('id', u.id)
              )
            );
          }

          // 2. Tải lại danh sách đoàn viên mới nhất của chi đoàn
          const { data: refreshedMembers } = await supabase
            .from('members')
            .select('*')
            .eq('department_id', departmentId)
            .order('created_at', { ascending: true });

          const updatedMembers = refreshedMembers || [];
          setMembers(updatedMembers);
          existingMembersMap.clear();
          updatedMembers.forEach((m) => existingMembersMap.set(normalizeName(m.full_name), m));

          // Tải lại evaluations hiện tại của tháng đang chọn
          let currentEvaluations: Record<string, any> = {};
          if (updatedMembers.length > 0) {
            const { data: evalsData } = await supabase
              .from('evaluations')
              .select('*')
              .in(
                'member_id',
                updatedMembers.map((m) => m.id)
              )
              .eq('year', currentYear)
              .eq('month', currentMonth);
            (evalsData || []).forEach((ev) => {
              currentEvaluations[ev.member_id] = ev;
            });
          }

          // 3. Map điểm theo tên cho cả thành viên mới và thành viên cũ
          const newEvals = { ...currentEvaluations };
          const upsertRows: any[] = [];
          const memberProcessed = new Set<string>();
          let scoredCount = 0;

          parsed.forEach((item) => {
            const nameKey = normalizeName(item.full_name);
            const member = existingMembersMap.get(nameKey);
            if (!member || memberProcessed.has(member.id)) return;
            memberProcessed.add(member.id);

            if (item.hasScores) {
              scoredCount++;
              const s1 = item.score_1 ?? 0;
              const s2 = item.score_2 ?? 0;
              const s3 = item.score_3 ?? 0;
              const s4 = item.score_4 ?? 0;
              const s5 = item.score_5 ?? 0;
              const existingEv = newEvals[member.id] || {};
              const noteVal = item.note || existingEv.note || '';

              newEvals[member.id] = {
                ...existingEv,
                member_id: member.id,
                department_id: departmentId,
                year: currentYear,
                month: currentMonth,
                score_1: s1,
                score_2: s2,
                score_3: s3,
                score_4: s4,
                score_5: s5,
                total_score: s1 + s2 + s3 + s4 + s5,
                note: noteVal,
              };

              const rowToUpsert: any = {
                member_id: member.id,
                department_id: departmentId,
                year: currentYear,
                month: currentMonth,
                score_1: s1,
                score_2: s2,
                score_3: s3,
                score_4: s4,
                score_5: s5,
                note: noteVal,
              };
              upsertRows.push(rowToUpsert);
            }
          });

          // 4. Lưu điểm vào DB luôn nếu trong file có điểm
          if (upsertRows.length > 0) {
            const { error: upsertErr } = await supabase
              .from('evaluations')
              .upsert(upsertRows, { onConflict: 'member_id, year, month' });
            if (upsertErr) throw upsertErr;
          }

          await fetchData();

          const addedMsg =
            missingMembers.length > 0 ? `thêm mới ${missingMembers.length} đoàn viên` : '';
          const scoredMsg =
            scoredCount > 0 ? `cập nhật & lưu điểm cho ${scoredCount} đoàn viên` : '';
          const summaryMsg = [addedMsg, scoredMsg].filter(Boolean).join(', ');

          toast.success(
            summaryMsg
              ? `Import thành công: Đã ${summaryMsg}!`
              : 'File Excel không có đoàn viên mới hoặc điểm mới để cập nhật.'
          );

          setShowImportModal(false);
          setShowMemberModal(false);
          setLoading(false);
        } catch (err: any) {
          toast.error('Lỗi import dữ liệu: ' + err.message);
          setLoading(false);
        }
      } catch (err) {
        toast.error('Lỗi đọc file Excel. Vui lòng kiểm tra lại file.');
      }
    };
    reader.readAsArrayBuffer(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportGradeFileProcess = (file: File) => {
    processExcelMembersAndScores(file);
  };

  const handleAddMemberFileProcess = (file: File) => {
    processExcelMembersAndScores(file);
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
            <span className="text-slate-400">Năm:</span>
            <select 
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              value={currentYear}
              onChange={(e) => {
                const y = parseInt(e.target.value);
                setCurrentYear(y);
                // Reset month if current month exceeds available months for new year
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
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-secondary" onClick={() => setShowMemberModal(true)}>
            <UserPlus size={18} />
            Thêm Đoàn viên
          </button>
          <button className="btn btn-secondary" onClick={handleQuickFillScores} disabled={members.length === 0}>
            <Zap size={18} />
            Điền nhanh
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
            <FileUp size={18} />
            Import điểm từ excel
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
              ) : members.length === 0 ? (
                <tr><td colSpan={12} className="text-center p-12 text-slate-400">Chưa có đoàn viên nào trong phòng ban. Hãy thêm mới hoặc import từ Excel.</td></tr>
              ) : (
                members.map((member, index) => {
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
                      <td className="table-td font-medium border-r border-slate-700/50 text-white p-1 text-sm">{member.full_name}</td>
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
          <div className="glass-panel w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Thêm Đoàn viên mới</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowMemberModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-slate-700 mb-6 gap-2">
              <button className={`pb-2 px-4 font-medium text-sm transition-colors ${memberModalTab === 'manual' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-slate-400 hover:text-slate-300'}`} onClick={() => setMemberModalTab('manual')}>Nhập thủ công</button>
              <button className={`pb-2 px-4 font-medium text-sm transition-colors ${memberModalTab === 'excel' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-slate-400 hover:text-slate-300'}`} onClick={() => setMemberModalTab('excel')}>Import bằng Excel</button>
            </div>

            {memberModalTab === 'manual' ? (
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
                  <select 
                    className="form-input bg-black text-white" 
                    required
                    value={memberForm.title}
                    onChange={e => setMemberForm({...memberForm, title: e.target.value})}
                  >
                    <option value="" disabled className="bg-black text-white">Chọn chức danh</option>
                    <option value="Bí Thư Đoàn Thanh Niên" className="bg-black text-white">Bí Thư Đoàn Thanh Niên</option>
                    <option value="Bí thư chi đoàn" className="bg-black text-white">Bí thư chi đoàn</option>
                    <option value="Phó bí thư đoàn thanh niên" className="bg-black text-white">Phó bí thư đoàn thanh niên</option>
                    <option value="Phó bí thư chi đoàn" className="bg-black text-white">Phó bí thư chi đoàn</option>
                    <option value="Ủy viên BCH Đoàn thanh niên trung tâm" className="bg-black text-white">Ủy viên BCH Đoàn thanh niên trung tâm</option>
                    <option value="Ủy viên BCH chi đoàn" className="bg-black text-white">Ủy viên BCH chi đoàn</option>
                    <option value="Đoàn viên" className="bg-black text-white">Đoàn viên</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMemberModal(false)}>Hủy</button>
                  <button type="submit" className="btn btn-primary">Thêm</button>
                </div>
              </form>
            ) : (
              <div>
                <p className="text-sm text-slate-300 mb-4">Tải file mẫu về, nhập danh sách đoàn viên mới và kéo thả vào ô bên dưới.</p>
                <div className="mb-6">
                  <button type="button" className="btn btn-secondary w-full py-2 text-sm justify-center border-slate-700 hover:bg-slate-800" onClick={downloadTemplateAdd}>
                    <Download size={16} className="text-blue-400" /> Tải mẫu thêm đoàn viên
                  </button>
                </div>
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${dragActive ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'}`}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleAddMemberFileProcess(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <FileUp size={48} className={`mx-auto mb-4 transition-colors ${dragActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <p className="text-base font-medium text-slate-200 mb-1">Kéo thả file Excel vào đây</p>
                  <p className="text-sm text-slate-500 mb-4">hoặc</p>
                  <label className="btn btn-primary cursor-pointer inline-flex shadow-lg shadow-blue-500/20">
                    <span>Chọn file từ máy tính</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleAddMemberFileProcess(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
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
                <select 
                  className="form-input bg-black text-white" 
                  required
                  value={editMemberForm.title}
                  onChange={e => setEditMemberForm({...editMemberForm, title: e.target.value})}
                >
                  <option value="" disabled className="bg-black text-white">Chọn chức danh</option>
                  <option value="Bí Thư Đoàn Thanh Niên" className="bg-black text-white">Bí Thư Đoàn Thanh Niên</option>
                  <option value="Bí thư chi đoàn" className="bg-black text-white">Bí thư chi đoàn</option>
                  <option value="Phó bí thư đoàn thanh niên" className="bg-black text-white">Phó bí thư đoàn thanh niên</option>
                  <option value="Phó bí thư chi đoàn" className="bg-black text-white">Phó bí thư chi đoàn</option>
                  <option value="Ủy viên BCH Đoàn thanh niên trung tâm" className="bg-black text-white">Ủy viên BCH Đoàn thanh niên trung tâm</option>
                  <option value="Ủy viên BCH chi đoàn" className="bg-black text-white">Ủy viên BCH chi đoàn</option>
                  <option value="Đoàn viên" className="bg-black text-white">Đoàn viên</option>
                </select>
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
                <strong>Lưu ý:</strong> Điểm đánh giá của các tháng cũ vẫn được lưu ở Chi đoàn cũ. Việc đánh giá từ tháng này trở đi sẽ được thực hiện ở Chi đoàn mới.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Chi đoàn chuyển đến</label>
                <select 
                  className="form-input bg-black text-white" 
                  required
                  value={targetDepartmentId}
                  onChange={e => setTargetDepartmentId(e.target.value)}
                >
                  <option value="" disabled className="bg-black text-white">-- Chọn Chi đoàn mới --</option>
                  {allDepartments.filter(d => d.id !== departmentId).map(dept => (
                    <option key={dept.id} value={dept.id} className="bg-black text-white">{dept.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 border-transparent">Xác nhận chuyển</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import Điểm Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-lg p-6 animate-in zoom-in-95 duration-200 border border-slate-700/50 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Nhập điểm từ Excel</h3>
              <button className="text-slate-400 hover:text-white transition-colors" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm text-slate-300">Tải danh sách hiện tại về để chấm điểm, sau đó kéo thả file đã điền vào ô bên dưới để cập nhật lên hệ thống.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" className="btn btn-secondary flex-1 py-2 text-sm justify-center border-slate-700 hover:bg-slate-800" onClick={downloadTemplateGrade}>
                  <Download size={16} className="text-emerald-400" /> Tải mẫu xuất chấm điểm
                </button>
              </div>
            </div>

            <div 
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${dragActive ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'}`}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleImportGradeFileProcess(e.dataTransfer.files[0]);
                }
              }}
            >
              <FileUp size={48} className={`mx-auto mb-4 transition-colors ${dragActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <p className="text-base font-medium text-slate-200 mb-1">Kéo thả file Excel vào đây</p>
              <p className="text-sm text-slate-500 mb-6">hoặc</p>
              <label className="btn btn-primary cursor-pointer inline-flex shadow-lg shadow-blue-500/20">
                <span>Chọn file từ máy tính</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleImportGradeFileProcess(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

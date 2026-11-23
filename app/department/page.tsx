'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, Save, UserPlus, RefreshCw, X, FileDown, FileUp, Upload, Download, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';

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
        if (ev.id) row.id = ev.id;
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
    if (score == null) return { text: '-', class: '' };
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

  const handleImportGradeFileProcess = (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        let startRow = 0;
        let nameCol = 0;
        let titleCol = 1;

        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i] || [];
          for (let j = 0; j < row.length; j++) {
            const cellVal = String(row[j] || '').toLowerCase();
            if (cellVal.includes('họ') && cellVal.includes('tên')) {
              startRow = i + 1;
              nameCol = j;
              titleCol = nameCol + 1;
              break;
            }
          }
          if (startRow > 0) break;
        }

        const s1Col = titleCol + 1;
        const s2Col = titleCol + 2;
        const s3Col = titleCol + 3;
        const s4Col = titleCol + 4;
        const s5Col = titleCol + 5;
        const noteCol = titleCol + 6;

        const parsed: any[] = [];
        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          
          const name = String(row[nameCol] || '').trim();
          const title = String(row[titleCol] || '').trim();

          if (!name) continue;

          const parseNum = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };

          parsed.push({
            full_name: name,
            title: title || 'Đoàn viên',
            score_1: parseNum(row[s1Col]),
            score_2: parseNum(row[s2Col]),
            score_3: parseNum(row[s3Col]),
            score_4: parseNum(row[s4Col]),
            score_5: parseNum(row[s5Col]),
            note: String(row[noteCol] || '').trim(),
          });
        }

        if (parsed.length === 0) {
          toast.error('Không tìm thấy dữ liệu hợp lệ trong file Excel. Đảm bảo file có cột Họ và tên, Chức danh.');
          return;
        }

        try {
          setLoading(true);
          const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
          const existingMembersMap = new Map<string, any>();
          members.forEach(m => existingMembersMap.set(normalizeName(m.full_name), m));

          // Tự động thêm/kéo những đoàn viên có trong file Excel nhưng chưa có trong danh sách chi đoàn hiện tại
          const missingMembers: { full_name: string; title: string }[] = [];
          const seenMissing = new Set<string>();
          parsed.forEach(item => {
            const nameKey = normalizeName(item.full_name);
            if (nameKey && !existingMembersMap.has(nameKey) && !seenMissing.has(nameKey)) {
              seenMissing.add(nameKey);
              missingMembers.push({
                full_name: item.full_name.trim(),
                title: item.title || 'Đoàn viên'
              });
            }
          });

          let currentEvaluations = { ...evaluations };
          if (missingMembers.length > 0) {
            const insertRows = missingMembers.map(item => ({
              department_id: departmentId,
              full_name: item.full_name,
              title: item.title
            }));
            const { error: insertErr } = await supabase.from('members').insert(insertRows);
            if (insertErr) throw insertErr;

            // Tải lại danh sách đoàn viên và điểm sau khi trigger DB đã gộp lịch sử điểm từ chi đoàn cũ
            const { data: refreshedMembers } = await supabase
              .from('members')
              .select('*')
              .eq('department_id', departmentId)
              .order('created_at', { ascending: true });

            const updatedMembers = refreshedMembers || [];
            setMembers(updatedMembers);
            existingMembersMap.clear();
            updatedMembers.forEach(m => existingMembersMap.set(normalizeName(m.full_name), m));

            if (updatedMembers.length > 0) {
              const { data: evalsData } = await supabase
                .from('evaluations')
                .select('*')
                .in('member_id', updatedMembers.map(m => m.id))
                .eq('year', currentYear)
                .eq('month', currentMonth);
              const evalsMap: Record<string, any> = {};
              (evalsData || []).forEach(ev => {
                evalsMap[ev.member_id] = ev;
              });
              currentEvaluations = evalsMap;
            }
          }

          const newEvals = { ...currentEvaluations };
          let mappedCount = 0;

          // Phân loại và điền điểm
          const memberAdded = new Set();
          parsed.forEach(item => {
            const nameKey = normalizeName(item.full_name);
            const existing = existingMembersMap.get(nameKey);
            const hasScores = item.score_1 !== null || item.score_2 !== null || item.score_3 !== null || item.score_4 !== null || item.score_5 !== null;
            
            if (existing && hasScores) {
               if (!memberAdded.has(existing.id)) {
                 mappedCount++;
                 const s1 = item.score_1 || 0;
                 const s2 = item.score_2 || 0;
                 const s3 = item.score_3 || 0;
                 const s4 = item.score_4 || 0;
                 const s5 = item.score_5 || 0;
                 
                 const existingEv = newEvals[existing.id] || {};
                 
                 newEvals[existing.id] = {
                   ...existingEv,
                   member_id: existing.id,
                   score_1: s1,
                   score_2: s2,
                   score_3: s3,
                   score_4: s4,
                   score_5: s5,
                   total_score: s1 + s2 + s3 + s4 + s5,
                   note: item.note || existingEv.note || ''
                 };
                 memberAdded.add(existing.id);
               }
            }
          });

          if (mappedCount > 0) {
             setEvaluations(newEvals);
             toast.success(`Đã tải điểm của ${mappedCount} đoàn viên lên bảng (Chưa lưu). Vui lòng kiểm tra và bấm "Lưu đánh giá" để hoàn tất!`);
          } else {
             toast.info('Không có dữ liệu điểm nào khớp với danh sách hiện tại.');
          }
          
          setShowImportModal(false);
          setLoading(false);

        } catch (err: any) {
          toast.error('Lỗi import điểm: ' + err.message);
          setLoading(false);
        }

      } catch (err) {
        toast.error('Lỗi đọc file Excel. Vui lòng kiểm tra lại file.');
      }
    };
    reader.readAsArrayBuffer(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const handleAddMemberFileProcess = (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        let startRow = 0;
        let nameCol = 0;
        let titleCol = 1;

        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i] || [];
          for (let j = 0; j < row.length; j++) {
            const cellVal = String(row[j] || '').toLowerCase();
            if (cellVal.includes('họ') && cellVal.includes('tên')) {
              startRow = i + 1;
              nameCol = j;
              titleCol = nameCol + 1;
              break;
            }
          }
          if (startRow > 0) break;
        }

        const parsed: any[] = [];
        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          const name = String(row[nameCol] || '').trim();
          const title = String(row[titleCol] || '').trim();
          if (!name) continue;
          parsed.push({ full_name: name, title: title || 'Đoàn viên' });
        }

        if (parsed.length === 0) {
          toast.error('Không tìm thấy dữ liệu hợp lệ trong file Excel.');
          return;
        }

        try {
          setLoading(true);
          const existingMembersMap = new Map();
          members.forEach(m => existingMembersMap.set(m.full_name.trim().toLowerCase(), m));

          const newMembersToInsert: any[] = [];
          parsed.forEach(item => {
            const nameKey = item.full_name.trim().toLowerCase();
            if (!existingMembersMap.has(nameKey)) {
              newMembersToInsert.push(item);
              existingMembersMap.set(nameKey, true); // Prevent duplicates within the file itself
            }
          });

          if (newMembersToInsert.length > 0) {
            const insertData = newMembersToInsert.map(item => ({
              department_id: departmentId,
              full_name: item.full_name,
              title: item.title
            }));
            const { error } = await supabase.from('members').insert(insertData);
            if (error) throw error;
          }

          toast.success(`Đã thêm mới thành công ${newMembersToInsert.length} đoàn viên!`);
          setShowMemberModal(false);
          fetchData();
        } catch (err: any) {
          toast.error('Lỗi thêm đoàn viên: ' + err.message);
          setLoading(false);
        }

      } catch (err) {
        toast.error('Lỗi đọc file Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ============ EXPORT EXCEL ============
  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      
      // Build data rows
      const rows: any[][] = [];
      
      // Header rows (matching template)
      rows.push([]); // row 0 - empty
      rows.push([]); // row 1 - empty
      rows.push(['ĐOÀN XÃ QUẢNG OAI', '', '', '', '', '', '', 'ĐOÀN TNCS HỒ CHÍ MINH']);
      rows.push([`ĐOÀN THANH NIÊN TRUNG TÂM CHĂM SÓC VÀ PHỤC HỒI CHỨC NĂNG NGƯỜI TÂM THẦN SỐ 1\n***`]);
      rows.push(['DANH SÁCH TỔNG HỢP ']);
      rows.push(['KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI ĐOÀN VIÊN']);
      rows.push([`Tháng ${currentMonth} năm ${currentYear}\n------`]);
      rows.push([]); // empty row
      
      // Table header row 1
      rows.push([
        'STT', 'Họ và tên', 'Chức danh',
        'Lý tưởng cách mạng, nhận thức chính trị',
        'Đạo đức, lối sống, tác phong đoàn viên',
        'Công tác chuyên môn nghiệp vụ',
        'Rèn luyện sức khoẻ',
        'Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn',
        `Chi đoàn \nđánh giá`, '',
        'Ghi chú'
      ]);
      
      // Table header row 2
      rows.push([
        '', '', '', '', '', '', '', '',
        'Tổng điểm', 'Mức xếp loại',
        ''
      ]);

      // Department name row
      rows.push([departmentName.toUpperCase()]);

      // Data rows
      let countA = 0, countB = 0, countC = 0, countD = 0;
      members.forEach((member, index) => {
        const ev = evaluations[member.id] || {};
        const total = ev.total_score ?? 0;
        const hasEval = ev.id || ev.total_score !== undefined;
        const rank = hasEval ? getRank(total) : { text: '', class: '' };
        
        if (hasEval && total > 0) {
          if (total >= 90) countA++;
          else if (total >= 70) countB++;
          else if (total >= 50) countC++;
          else countD++;
        }

        rows.push([
          index + 1,
          member.full_name,
          member.title,
          hasEval ? (ev.score_1 || 0) : '',
          hasEval ? (ev.score_2 || 0) : '',
          hasEval ? (ev.score_3 || 0) : '',
          hasEval ? (ev.score_4 || 0) : '',
          hasEval ? (ev.score_5 || 0) : '',
          hasEval ? total : '',
          rank.text,
          ev.note || ''
        ]);
      });

      // Summary row
      rows.push([]);
      rows.push([`Tổng số: ${members.length} đoàn viên. Trong đó: Xếp loại A: ${countA}; Xếp loại B: ${countB}; Xếp loại C: ${countC};  Xếp loại D: ${countD}`]);
      
      // Footer
      const now = new Date();
      rows.push(['', '', '', '', '', '', '', '', '', `Hà Nội, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`]);
      rows.push([]);
      rows.push(['Nơi nhận', '', '', '', '', '', '', '', '', 'TM. BCH ĐOÀN']);
      rows.push(['Đảng uỷ (để báo cáo);', '', '', '', '', '', '', '', '', ' BÍ THƯ']);
      rows.push(['Các chi đoàn;']);
      rows.push(['Lưu: VP đoàn./.']);
      rows.push([]);
      rows.push(['', '', '', '', '', '', '', '', '', 'Nguyễn Thị Diệu Linh']);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Set column widths
      ws['!cols'] = [
        { wch: 5 },   // STT
        { wch: 28 },  // Họ và tên
        { wch: 15 },  // Chức danh
        { wch: 12 },  // TC1
        { wch: 12 },  // TC2
        { wch: 12 },  // TC3
        { wch: 10 },  // TC4
        { wch: 12 },  // TC5
        { wch: 10 },  // Tổng điểm CĐ
        { wch: 12 },  // Xếp loại CĐ
        { wch: 10 },  // Tổng điểm BCH
        { wch: 12 },  // Xếp loại BCH
        { wch: 40 },  // Ghi chú
      ];

      // Merge cells for headers
      ws['!merges'] = [
        // Header organization names
        { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
        { s: { r: 2, c: 7 }, e: { r: 2, c: 12 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 12 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: 12 } },
        { s: { r: 5, c: 0 }, e: { r: 5, c: 12 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 12 } },
        // Table header merges - STT, Họ tên, Chức danh span 2 rows
        { s: { r: 8, c: 0 }, e: { r: 9, c: 0 } },
        { s: { r: 8, c: 1 }, e: { r: 9, c: 1 } },
        { s: { r: 8, c: 2 }, e: { r: 9, c: 2 } },
        // Score columns span 2 rows each
        { s: { r: 8, c: 3 }, e: { r: 9, c: 3 } },
        { s: { r: 8, c: 4 }, e: { r: 9, c: 4 } },
        { s: { r: 8, c: 5 }, e: { r: 9, c: 5 } },
        { s: { r: 8, c: 6 }, e: { r: 9, c: 6 } },
        { s: { r: 8, c: 7 }, e: { r: 9, c: 7 } },
        // Chi đoàn đánh giá: 2 cols
        { s: { r: 8, c: 8 }, e: { r: 8, c: 9 } },
        // BCH Đoàn TT: 2 cols
        { s: { r: 8, c: 10 }, e: { r: 8, c: 11 } },
        // Ghi chú span 2 rows
        { s: { r: 8, c: 12 }, e: { r: 9, c: 12 } },
        // Department name row
        { s: { r: 10, c: 0 }, e: { r: 10, c: 12 } },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Đánh giá');
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
              {Array.from({ length: new Date().getFullYear() - 2026 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
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
                      <td className="p-1 border-b border-slate-700/50"><input type="text" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50" disabled={isLocked} value={ev.note ?? ''} onChange={e => handleScoreChange(member.id, 'note', e.target.value)} placeholder="..." /></td>
                      
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

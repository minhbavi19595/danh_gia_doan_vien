'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, Save, UserPlus, RefreshCw, X, FileDown, FileUp, Upload, Download } from 'lucide-react';
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
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ full_name: '', title: '' });

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchDepartmentInfo();
    }
  }, [user]);

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
      const { data, error } = await supabase
        .from('members')
        .insert([{
          department_id: departmentId,
          full_name: memberForm.full_name,
          title: memberForm.title
        }])
        .select();
      
      if (error) throw error;
      setMembers([...members, data[0]]);
      setShowMemberModal(false);
      setMemberForm({ full_name: '', title: '' });
      toast.success('Thêm đoàn viên thành công!');
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

  const saveEvaluations = async () => {
    setSaving(true);
    try {
      const upsertData = Object.entries(evaluations).map(([memberId, ev]) => {
        const row: any = {
          member_id: memberId,
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

  // ============ IMPORT EXCEL ============
  // ============ DOWNLOAD TEMPLATE ============
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const templateData = [
      ['Họ và tên', 'Chức danh', 'Lý tưởng cách mạng, nhận thức chính trị', 'Đạo đức, lối sống, tác phong đoàn viên', 'Công tác chuyên môn nghiệp vụ', 'Rèn luyện sức khoẻ', 'Ý thức xây dựng tổ chức đoàn', 'Ghi chú'],
      ['Nguyễn Văn A', 'Bí thư', 20, 20, 19, 12, 20, ''],
      ['Trần Thị B', 'Phó Bí thư', 20, 20, 19, 10, 20, ''],
      ['Lê Văn C', 'Đoàn viên', '', '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
    XLSX.writeFile(wb, 'Mau_import_doan_vien.xlsx');
    toast.info('Đã tải file Excel mẫu!');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        // Find header row (look for 'họ' + 'tên')
        let startRow = 0;
        let nameCol = 0;
        let titleCol = 1;
        for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
          const row = jsonData[i];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            const cell = String(row[c] || '').toLowerCase().trim();
            if (cell.includes('họ') && cell.includes('tên')) {
              nameCol = c;
              titleCol = c + 1;
              startRow = i + 1;
              break;
            }
          }
          if (startRow > 0) break;
        }

        // Score columns start right after titleCol
        const s1Col = titleCol + 1;
        const s2Col = titleCol + 2;
        const s3Col = titleCol + 3;
        const s4Col = titleCol + 4;
        const s5Col = titleCol + 5;
        const noteCol = titleCol + 6;

        // Parse data rows
        const parsed: any[] = [];
        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row) continue;
          
          const name = String(row[nameCol] || '').trim();
          const title = String(row[titleCol] || '').trim();

          // Skip empty rows
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

        setImportData(parsed);
        setShowImportModal(true);
      } catch (err) {
        toast.error('Lỗi đọc file Excel. Vui lòng kiểm tra lại file.');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    try {
      setImportLoading(true);
      
      const insertData = importData.map(item => ({
        department_id: departmentId,
        full_name: item.full_name,
        title: item.title
      }));

      const { data: insertedMembers, error } = await supabase
        .from('members')
        .insert(insertData)
        .select();

      if (error) throw error;

      // Save evaluations for members that have scores
      if (insertedMembers && insertedMembers.length > 0) {
        const evalsToInsert: any[] = [];
        insertedMembers.forEach((member: any, idx: number) => {
          const item = importData[idx];
          const hasScores = item.score_1 !== null || item.score_2 !== null || item.score_3 !== null || item.score_4 !== null || item.score_5 !== null;
          if (hasScores) {
            evalsToInsert.push({
              member_id: member.id,
              year: currentYear,
              month: currentMonth,
              score_1: item.score_1 || 0,
              score_2: item.score_2 || 0,
              score_3: item.score_3 || 0,
              score_4: item.score_4 || 0,
              score_5: item.score_5 || 0,
              note: item.note || ''
            });
          }
        });

        if (evalsToInsert.length > 0) {
          const { error: evalError } = await supabase
            .from('evaluations')
            .insert(evalsToInsert);
          if (evalError) console.error('Lỗi lưu điểm:', evalError);
        }
      }

      toast.success(`Import thành công ${importData.length} đoàn viên!`);
      setShowImportModal(false);
      setImportData([]);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi import: ' + err.message);
    } finally {
      setImportLoading(false);
    }
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
        'BCH Đoàn Trung tâm đánh giá', '',
        'Ghi chú'
      ]);
      
      // Table header row 2
      rows.push([
        '', '', '', '', '', '', '', '',
        'Tổng điểm', 'Mức xếp loại',
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
          '', '', // BCH columns (empty)
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
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-secondary" onClick={() => setShowMemberModal(true)}>
            <UserPlus size={18} />
            Thêm Đoàn viên
          </button>
          <label className="btn btn-secondary cursor-pointer">
            <FileUp size={18} />
            Import Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
          <button className="btn btn-secondary" onClick={downloadTemplate}>
            <Download size={18} />
            Tải file mẫu
          </button>
          <button className="btn btn-secondary" onClick={exportExcel}>
            <FileDown size={18} />
            Xuất Excel
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
                <th colSpan={2} className="table-th text-center border-r border-slate-700/50 bg-emerald-500/10 text-emerald-200">BCH Đoàn Trung tâm</th>
                <th rowSpan={2} className="table-th min-w-[150px]">Ghi chú</th>
              </tr>
              <tr>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Lý tưởng cách mạng, nhận thức chính trị">Lý tưởng<br/>nhận thức</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Đạo đức, lối sống, tác phong đoàn viên">Đạo đức<br/>lối sống</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Công tác chuyên môn nghiệp vụ">Chuyên môn<br/>nghiệp vụ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Rèn luyện sức khoẻ">Rèn luyện<br/>sức khoẻ</th>
                <th className="table-th text-center border-r border-slate-700/50 text-[10px] leading-tight whitespace-normal p-1 bg-slate-800/30 w-16" title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn">Ý thức<br/>phong trào</th>
                
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/5">Tổng<br/>điểm</th>
                <th className="table-th text-center border-r border-slate-700/50 bg-blue-500/5">Mức<br/>xếp loại</th>
                
                <th className="table-th text-center border-r border-slate-700/50 bg-emerald-500/5">Tổng<br/>điểm</th>
                <th className="table-th text-center border-r border-slate-700/50 bg-emerald-500/5">Mức<br/>xếp loại</th>
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
                  const rank = getRank(ev.id || ev.total_score !== undefined ? total : null);
                  
                  return (
                    <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="table-td text-center border-r border-slate-700/50 text-slate-400 p-1">{index + 1}</td>
                      <td className="table-td font-medium border-r border-slate-700/50 text-white p-1 text-sm">{member.full_name}</td>
                      <td className="table-td text-slate-400 border-r border-slate-700/50 p-1 text-xs">{member.title}</td>
                      
                      {/* Tiêu chí */}
                      <td className="p-1 border-b border-slate-700/50 border-r"><input type="number" min="0" max="100" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none" value={ev.score_1 ?? ''} onChange={e => handleScoreChange(member.id, 'score_1', e.target.value)} /></td>
                      <td className="p-1 border-b border-slate-700/50 border-r"><input type="number" min="0" max="100" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none" value={ev.score_2 ?? ''} onChange={e => handleScoreChange(member.id, 'score_2', e.target.value)} /></td>
                      <td className="p-1 border-b border-slate-700/50 border-r"><input type="number" min="0" max="100" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none" value={ev.score_3 ?? ''} onChange={e => handleScoreChange(member.id, 'score_3', e.target.value)} /></td>
                      <td className="p-1 border-b border-slate-700/50 border-r"><input type="number" min="0" max="100" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none" value={ev.score_4 ?? ''} onChange={e => handleScoreChange(member.id, 'score_4', e.target.value)} /></td>
                      <td className="p-1 border-b border-slate-700/50 border-r"><input type="number" min="0" max="100" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none" value={ev.score_5 ?? ''} onChange={e => handleScoreChange(member.id, 'score_5', e.target.value)} /></td>
                      
                      {/* Chi đoàn */}
                      <td className="table-td text-center border-r border-slate-700/50 font-bold text-sm bg-blue-500/5 p-1">{ev.id || ev.total_score !== undefined ? total : '-'}</td>
                      <td className="table-td text-center border-r border-slate-700/50 bg-blue-500/5 p-1"><span className={`badge ${rank.class} text-[10px] px-1 py-0.5`}>{rank.text}</span></td>
                      
                      {/* BCH Trung tâm (Giống Chi đoàn) */}
                      <td className="table-td text-center border-r border-slate-700/50 font-bold text-sm bg-emerald-500/5 p-1">{ev.id || ev.total_score !== undefined ? total : '-'}</td>
                      <td className="table-td text-center border-r border-slate-700/50 bg-emerald-500/5 p-1"><span className={`badge ${rank.class} text-[10px] px-1 py-0.5`}>{rank.text}</span></td>
                      
                      {/* Ghi chú */}
                      <td className="p-1 border-b border-slate-700/50"><input type="text" className="w-full bg-slate-900/50 border border-slate-700 rounded px-1 py-1 text-xs focus:border-blue-500 focus:outline-none" value={ev.note ?? ''} onChange={e => handleScoreChange(member.id, 'note', e.target.value)} placeholder="..." /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm đoàn viên */}
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
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={memberForm.title}
                  onChange={e => setMemberForm({...memberForm, title: e.target.value})}
                  placeholder="Chuyên viên"
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

      {/* Modal Import Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-2xl p-6 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                <Upload size={20} className="inline mr-2" />
                Xem trước dữ liệu Import ({importData.length} đoàn viên)
              </h3>
              <button className="text-slate-400 hover:text-white" onClick={() => { setShowImportModal(false); setImportData([]); }}>
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-auto flex-1 mb-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="table-th text-center w-10 p-1 text-xs">STT</th>
                    <th className="table-th w-32 p-1 text-xs">Họ và tên</th>
                    <th className="table-th w-24 p-1 text-xs">Chức danh</th>
                    <th className="table-th text-center text-[10px] leading-tight whitespace-normal w-12 p-1" title="Lý tưởng cách mạng, nhận thức chính trị">TC1</th>
                    <th className="table-th text-center text-[10px] leading-tight whitespace-normal w-12 p-1" title="Đạo đức, lối sống, tác phong đoàn viên">TC2</th>
                    <th className="table-th text-center text-[10px] leading-tight whitespace-normal w-12 p-1" title="Công tác chuyên môn nghiệp vụ">TC3</th>
                    <th className="table-th text-center text-[10px] leading-tight whitespace-normal w-12 p-1" title="Rèn luyện sức khoẻ">TC4</th>
                    <th className="table-th text-center text-[10px] leading-tight whitespace-normal w-12 p-1" title="Ý thức xây dựng tổ chức đoàn, tham gia phong trào đoàn">TC5</th>
                    <th className="table-th text-center text-xs p-1">Tổng</th>
                    <th className="table-th p-1 text-xs w-24">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.map((item, i) => {
                    const total = (item.score_1||0) + (item.score_2||0) + (item.score_3||0) + (item.score_4||0) + (item.score_5||0);
                    const hasScores = item.score_1 !== null || item.score_2 !== null;
                    return (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="table-td text-center text-slate-400 p-1 text-xs">{i + 1}</td>
                        <td className="table-td font-medium p-1 text-xs">{item.full_name}</td>
                        <td className="table-td text-slate-400 p-1 text-xs">{item.title}</td>
                        <td className="table-td text-center text-xs p-1">{item.score_1 ?? '-'}</td>
                        <td className="table-td text-center text-xs p-1">{item.score_2 ?? '-'}</td>
                        <td className="table-td text-center text-xs p-1">{item.score_3 ?? '-'}</td>
                        <td className="table-td text-center text-xs p-1">{item.score_4 ?? '-'}</td>
                        <td className="table-td text-center text-xs p-1">{item.score_5 ?? '-'}</td>
                        <td className="table-td text-center font-bold text-xs p-1">{hasScores ? total : '-'}</td>
                        <td className="table-td text-slate-400 text-xs p-1 truncate">{item.note || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
              <button className="btn btn-secondary" onClick={() => { setShowImportModal(false); setImportData([]); }}>Hủy</button>
              <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importLoading}>
                {importLoading ? 'Đang import...' : `Import ${importData.length} đoàn viên`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

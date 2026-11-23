'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import DashboardLayout from '@/components/DashboardLayout';

export default function ChiDoanList() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({ name: '' });
  const [editFormData, setEditFormData] = useState({ id: '', name: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setDepartments(data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
      toast.error('Lỗi khi tải danh sách chi đoàn');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('departments')
        .insert([{ name: formData.name }]);
        
      if (error) throw error;
      toast.success('Tạo Chi đoàn thành công!');
      setShowCreateModal(false);
      setFormData({ name: '' });
      fetchDepartments();
    } catch (err: any) {
      toast.error('Lỗi tạo chi đoàn: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('departments')
        .update({ name: editFormData.name })
        .eq('id', editFormData.id);
        
      if (error) throw error;
      toast.success('Cập nhật tên Chi đoàn thành công!');
      setShowEditModal(false);
      fetchDepartments();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (dept: any) => {
    const confirmed = await toast.confirm(
      `Bạn có chắc chắn muốn xóa chi đoàn "${dept.name}"?\nToàn bộ đoàn viên và dữ liệu đánh giá của chi đoàn này sẽ bị xóa vĩnh viễn.`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('admin_delete_department', {
        target_department_id: dept.id,
      });

      if (error) throw error;
      toast.success(`Đã xóa chi đoàn "${dept.name}"`);
      fetchDepartments();
    } catch (err: any) {
      toast.error('Lỗi khi xóa chi đoàn: ' + (err.message || 'Không xác định'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Danh sách Chi đoàn</h1>
          <p className="text-slate-400">Thêm và điều chỉnh tên các Chi đoàn</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          Thêm Chi đoàn mới
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-th w-16 text-center">STT</th>
                <th className="table-th">Tên Chi đoàn</th>
                <th className="table-th">Ngày tạo</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center p-8 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : departments.length === 0 ? (
                <tr><td colSpan={4} className="text-center p-8 text-slate-400">Chưa có chi đoàn nào</td></tr>
              ) : (
                departments.map((dept, idx) => (
                  <tr key={dept.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="table-td text-center">{idx + 1}</td>
                    <td className="table-td font-medium text-white">{dept.name}</td>
                    <td className="table-td">{new Date(dept.created_at).toLocaleDateString('vi-VN')}</td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Đổi tên"
                          onClick={() => {
                            setEditFormData({ id: dept.id, name: dept.name });
                            setShowEditModal(true);
                          }}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                          title="Xóa Chi đoàn"
                          onClick={() => handleDelete(dept)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Thêm Chi đoàn mới</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tên Chi đoàn</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="VD: Chi đoàn Khối 1"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Điều chỉnh tên Chi đoàn</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tên Chi đoàn mới</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={editFormData.name}
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Đang xử lý...' : 'Cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

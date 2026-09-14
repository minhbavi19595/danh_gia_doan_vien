'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Key, X, Eye, EyeOff, Lock, Unlock, ShieldCheck, ShieldOff } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export default function Departments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStatuses, setUserStatuses] = useState<Record<string, any>>({});
  const toast = useToast();
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedDept, setSelectedDept] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ newPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('departments')
        .select('id, user_id, name, created_at');
      
      if (error) throw error;
      setDepartments(data || []);

      // Fetch user ban statuses
      const { data: statusData } = await supabase.rpc('admin_get_users_status');
      if (statusData) {
        const statusMap: Record<string, any> = {};
        statusData.forEach((s: any) => {
          statusMap[s.user_id] = s;
        });
        setUserStatuses(statusMap);
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      
      const { error: rpcError } = await supabase.rpc('admin_create_user', {
        email: formData.email,
        password: formData.password,
        department_name: formData.name
      });
      
      if (rpcError) throw rpcError;
      
      toast.success('Tạo tài khoản phòng ban thành công!');
      setShowCreateModal(false);
      setFormData({ name: '', email: '', password: '' });
      setShowCreatePassword(false);
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra khi tạo tài khoản');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      
      const { error: rpcError } = await supabase.rpc('admin_update_user_password', {
        target_user_id: selectedDept.user_id,
        new_password: passwordForm.newPassword
      });
      
      if (rpcError) throw rpcError;
      
      toast.success('Đổi mật khẩu thành công!');
      setShowPasswordModal(false);
      setPasswordForm({ newPassword: '' });
      setShowUpdatePassword(false);
      setSelectedDept(null);
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra khi đổi mật khẩu');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBan = async (dept: any) => {
    const status = userStatuses[dept.user_id];
    const isBanned = status?.banned_until && new Date(status.banned_until) > new Date();
    
    try {
      const { error } = await supabase.rpc('admin_toggle_user_ban', {
        target_user_id: dept.user_id,
        is_banned: !isBanned
      });
      
      if (error) throw error;
      
      if (isBanned) {
        toast.success(`Đã mở khóa tài khoản "${dept.name}"`);
      } else {
        toast.info(`Đã khóa tài khoản "${dept.name}"`);
      }
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra');
    }
  };

  const isBanned = (userId: string) => {
    const status = userStatuses[userId];
    return status?.banned_until && new Date(status.banned_until) > new Date();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Quản lý Phòng ban</h1>
          <p className="text-slate-400">Tạo và quản lý tài khoản cho các Chi đoàn / Phòng ban</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          Tạo tài khoản mới
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="table-th">Tên Phòng ban (Chi đoàn)</th>
                <th className="table-th">Trạng thái</th>
                <th className="table-th">Mã User (User ID)</th>
                <th className="table-th">Ngày tạo</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center p-8 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : departments.length === 0 ? (
                <tr><td colSpan={5} className="text-center p-8 text-slate-400">Chưa có phòng ban nào</td></tr>
              ) : (
                departments.map(dept => (
                  <tr key={dept.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="table-td font-medium">{dept.name}</td>
                    <td className="table-td">
                      {isBanned(dept.user_id) ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                          <ShieldOff size={14} />
                          Đã khóa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <ShieldCheck size={14} />
                          Hoạt động
                        </span>
                      )}
                    </td>
                    <td className="table-td text-slate-500 text-xs font-mono">{dept.user_id}</td>
                    <td className="table-td">{new Date(dept.created_at).toLocaleDateString('vi-VN')}</td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          className={`p-2 rounded-lg transition-colors ${
                            isBanned(dept.user_id) 
                              ? 'text-red-400 hover:text-emerald-400 hover:bg-emerald-500/10' 
                              : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                          }`}
                          title={isBanned(dept.user_id) ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                          onClick={() => handleToggleBan(dept)}
                        >
                          {isBanned(dept.user_id) ? <Lock size={18} /> : <Unlock size={18} />}
                        </button>
                        <button 
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Đổi mật khẩu"
                          onClick={() => {
                            setSelectedDept(dept);
                            setShowPasswordModal(true);
                          }}
                        >
                          <Key size={18} />
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

      {/* Modal Tạo mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Tạo tài khoản Phòng ban</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tên Phòng ban / Chi đoàn</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="VD: Chi đoàn Marketing"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email đăng nhập</label>
                <input 
                  type="email" 
                  className="form-input" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  placeholder="marketing@doan.vn"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Mật khẩu</label>
                <div className="relative">
                  <input 
                    type={showCreatePassword ? "text" : "password"} 
                    className="form-input pr-10 w-full" 
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Ít nhất 6 ký tự"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                  >
                    {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đổi mật khẩu */}
      {showPasswordModal && selectedDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Đổi mật khẩu</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowPasswordModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <p className="text-slate-400">Đổi mật khẩu cho: <strong className="text-white">{selectedDept.name}</strong></p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Mật khẩu mới</label>
                <div className="relative">
                  <input 
                    type={showUpdatePassword ? "text" : "password"} 
                    className="form-input pr-10 w-full" 
                    required
                    minLength={6}
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm({ newPassword: e.target.value })}
                    placeholder="Ít nhất 6 ký tự"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                    onClick={() => setShowUpdatePassword(!showUpdatePassword)}
                  >
                    {showUpdatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Đang xử lý...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

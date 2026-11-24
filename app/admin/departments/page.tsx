'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Key, X, Eye, EyeOff, Lock, Unlock, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import CustomSelect from '@/components/CustomSelect';

export default function Departments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedDept, setSelectedDept] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({ department_id: '', email: '', password: '', role: 'bi_thu_chi_doan' });
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

      // Fetch users
      const { data: usersData, error: usersError } = await supabase.rpc('admin_get_all_users');
      if (usersError) throw usersError;
      setUsers(usersData || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.role === 'bi_thu_chi_doan' && !formData.department_id) {
      toast.error('Vui lòng chọn Chi đoàn trực thuộc');
      return;
    }
    try {
      setSubmitting(true);
      
      const { error: rpcError } = await supabase.rpc('admin_create_user', {
        email: formData.email,
        password: formData.password,
        p_department_id: formData.role === 'bi_thu_chi_doan' ? formData.department_id : null,
        role_name: formData.role
      });
      
      if (rpcError) throw rpcError;
      
      toast.success('Tạo tài khoản thành công!');
      setShowCreateModal(false);
      setFormData({ department_id: '', email: '', password: '', role: 'bi_thu_chi_doan' });
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
        target_user_id: selectedDept.id, // selectedDept is now a user object
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

  const handleToggleBan = async (user: any) => {
    const isBanned = user.banned_until && new Date(user.banned_until) > new Date();
    
    try {
      const { error } = await supabase.rpc('admin_toggle_user_ban', {
        target_user_id: user.id,
        is_banned: !isBanned
      });
      
      if (error) throw error;
      
      if (isBanned) {
        toast.success(`Đã mở khóa tài khoản "${user.email}"`);
      } else {
        toast.info(`Đã khóa tài khoản "${user.email}"`);
      }
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra');
    }
  };

  const handleDeleteUser = async (user: any) => {
    const confirmed = await toast.confirm(
      `Bạn có chắc chắn muốn xóa tài khoản "${user.email}"?\n(Chi đoàn và danh sách đoàn viên vẫn được giữ nguyên)`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: user.id,
      });

      if (error) throw error;
      toast.success(`Đã xóa tài khoản "${user.email}"`);
      fetchDepartments();
    } catch (err: any) {
      toast.error('Lỗi khi xóa tài khoản: ' + (err.message || 'Không xác định'));
    }
  };

  const isBanned = (user: any) => {
    return user.banned_until && new Date(user.banned_until) > new Date();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Quản lý Chi đoàn & Tài khoản</h1>
          <p className="text-slate-400">Tạo và quản lý tài khoản cho các Chi đoàn / Bí thư Đoàn</p>
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
                <th className="table-th">Email</th>
                <th className="table-th">Role</th>
                <th className="table-th">Chi đoàn (nếu có)</th>
                <th className="table-th">Trạng thái</th>
                <th className="table-th">Ngày tạo</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center p-8 text-slate-400">Đang tải dữ liệu...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-8 text-slate-400">Chưa có tài khoản nào</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="table-td font-medium text-white">{user.email}</td>
                    <td className="table-td">
                      <span className={`badge ${user.role === 'bi_thu_doan' ? 'badge-a text-[10px]' : 'badge-b text-[10px]'}`}>
                        {user.role === 'bi_thu_doan' ? 'Bí thư Đoàn' : 'Bí thư Chi đoàn'}
                      </span>
                    </td>
                    <td className="table-td text-slate-400">{user.department_name || '-'}</td>
                    <td className="table-td">
                      {isBanned(user) ? (
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
                    <td className="table-td">{new Date(user.created_at).toLocaleDateString('vi-VN')}</td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          className={`p-2 rounded-lg transition-colors ${
                            isBanned(user) 
                              ? 'text-red-400 hover:text-emerald-400 hover:bg-emerald-500/10' 
                              : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                          }`}
                          title={isBanned(user) ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                          onClick={() => handleToggleBan(user)}
                        >
                          {isBanned(user) ? <Lock size={18} /> : <Unlock size={18} />}
                        </button>
                        <button 
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Đổi mật khẩu"
                          onClick={() => {
                            setSelectedDept(user);
                            setShowPasswordModal(true);
                          }}
                        >
                          <Key size={18} />
                        </button>
                        <button
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Xóa tài khoản"
                          onClick={() => handleDeleteUser(user)}
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

      {/* Modal Tạo mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Tạo tài khoản</h3>
              <button className="text-slate-400 hover:text-white" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Vai trò (Role)</label>
                <CustomSelect
                  size="md"
                  value={formData.role}
                  onChange={(val) => setFormData({ ...formData, role: val })}
                  options={[
                    { value: 'bi_thu_chi_doan', label: 'Bí thư Chi đoàn' },
                    { value: 'bi_thu_doan', label: 'Bí thư Đoàn Trung tâm' },
                  ]}
                />
              </div>

              {formData.role === 'bi_thu_chi_doan' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Chọn Chi đoàn</label>
                  <CustomSelect
                    size="md"
                    placeholder="-- Chọn Chi đoàn (chưa có tài khoản) --"
                    value={formData.department_id}
                    onChange={(val) => setFormData({ ...formData, department_id: val })}
                    options={departments
                      .filter((d) => !d.user_id)
                      .map((d) => ({ value: d.id, label: d.name }))}
                  />
                </div>
              )}
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
              <p className="text-slate-400">Đổi mật khẩu cho: <strong className="text-white">{selectedDept.email}</strong></p>
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

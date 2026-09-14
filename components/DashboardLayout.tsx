'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
  allowedRole
}: {
  children: React.ReactNode;
  allowedRole: 'admin' | 'department';
}) {
  const { user, role, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (role !== allowedRole) {
        router.replace('/');
      }
    }
  }, [user, role, loading, allowedRole, router]);

  if (loading || !user || role !== allowedRole) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-8">
          <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Đoàn Viên VN
          </div>
          <div className="flex items-center gap-6">
            <Link 
              href={role === 'admin' ? '/admin' : '/department'} 
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${pathname === '/admin' || pathname === '/department' ? 'text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </Link>
            {role === 'admin' && (
              <Link 
                href="/admin/departments" 
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${pathname.includes('/departments') ? 'text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <Users size={18} />
                Quản lý Phòng ban
              </Link>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400 flex items-center gap-2">
            {user.email}
            <span className="badge badge-b bg-blue-500/20">{role === 'admin' ? 'Admin' : 'Phòng Ban'}</span>
          </div>
          <button 
            onClick={logout} 
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Đăng xuất"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}

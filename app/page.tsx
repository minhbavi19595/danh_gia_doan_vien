'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (role === 'department' || role === 'bi_thu_chi_doan') {
        router.push('/department');
      } else if (role === 'admin') {
        router.push('/admin');
      } else if (role === 'bi_thu_doan') {
        router.push('/admin/approvals');
      } else {
        router.replace('/login');
      }
    }
  }, [user, role, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

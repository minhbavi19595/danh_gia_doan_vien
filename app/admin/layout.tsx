import DashboardLayout from '@/components/DashboardLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout allowedRole={["admin", "bi_thu_doan"]}>{children}</DashboardLayout>;
}

import DashboardLayout from '@/components/DashboardLayout';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout allowedRole="department">{children}</DashboardLayout>;
}

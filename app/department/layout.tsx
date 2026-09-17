import DashboardLayout from '@/components/DashboardLayout';

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout allowedRole={["department", "bi_thu_chi_doan"]}>{children}</DashboardLayout>;
}

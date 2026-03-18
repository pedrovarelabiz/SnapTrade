import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserTable } from '@/components/admin/UserTable';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { toast } from 'sonner';
import { User } from '@/types';

export default function AdminUsers() {
  const { data: users = [] } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminService.getUsers });

  const handleUpdateRole = (userId: string, role: User['role']) => {
    toast.success(`User role updated to ${role}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm text-[var(--st-text-secondary)]">{users.length} total users</p>
        </div>
        <UserTable users={users} onUpdateRole={handleUpdateRole} />
      </div>
    </DashboardLayout>
  );
}

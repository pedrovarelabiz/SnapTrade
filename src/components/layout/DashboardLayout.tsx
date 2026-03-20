import { AppSidebar } from './AppSidebar';
import { MobileNav } from './MobileNav';
import { SidebarProvider, useSidebarContext } from '@/contexts/SidebarContext';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarContext();

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)]">
      <AppSidebar />
      <main className={`min-h-screen pb-20 lg:pb-0 transition-all duration-300 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
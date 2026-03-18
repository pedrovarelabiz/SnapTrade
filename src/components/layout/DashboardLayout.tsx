import { AppSidebar } from './AppSidebar';
import { MobileNav } from './MobileNav';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)]">
      <AppSidebar />
      <main className="lg:ml-[260px] min-h-screen pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}

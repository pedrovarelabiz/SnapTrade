import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { Zap } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--st-bg-deep)] gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-st-accent to-st-info flex items-center justify-center animate-pulse">
            <Zap size={22} className="text-white" fill="white" />
          </div>
          <div className="absolute inset-0 w-12 h-12 rounded-xl border-2 border-st-accent/30 animate-ping" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white">Loading SnapTrade</p>
          <p className="text-xs text-[var(--st-text-secondary)] mt-1">Preparing your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (requiredRole === 'admin' && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
import { Link } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="relative text-center max-w-md">
        <Link to="/" className="inline-block mb-8"><Logo size="lg" /></Link>

        <div className="mb-8">
          <p className="text-8xl font-bold text-gradient mb-4">404</p>
          <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
          <p className="text-[var(--st-text-secondary)]">The page you're looking for doesn't exist or has been moved.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors">
            <Home size={16} />
            Go Home
          </Link>
          <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--st-border)] text-white text-sm font-medium hover:bg-[var(--st-border)]/30 transition-colors">
            <ArrowLeft size={16} />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

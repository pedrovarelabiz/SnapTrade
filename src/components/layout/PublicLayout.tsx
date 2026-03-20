import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { useAuth } from '@/hooks/useAuth';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)]">
      <header className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-[var(--st-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/">
              <Logo />
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              <Link to="/" className="text-sm text-[var(--st-text-secondary)] hover:text-white transition-colors">Home</Link>
              <Link to="/pricing" className="text-sm text-[var(--st-text-secondary)] hover:text-white transition-colors">Pricing</Link>
            </nav>

            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <button onClick={() => navigate('/dashboard')} className="px-5 py-2 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors">
                  Dashboard
                </button>
              ) : (
                <>
                  <button onClick={() => navigate('/login')} className="px-5 py-2 rounded-xl text-[var(--st-text-primary)] text-sm font-medium hover:bg-[var(--st-bg-elevated)] transition-colors">
                    Sign In
                  </button>
                  <button onClick={() => navigate('/register')} className="px-5 py-2 rounded-xl bg-st-accent text-white font-semibold text-sm hover:bg-st-accent/90 transition-colors">
                    Get Started
                  </button>
                </>
              )}
            </div>

            <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--st-border)] bg-[var(--st-bg-card)] animate-slide-down">
            <div className="px-4 py-4 space-y-3">
              <Link to="/" className="block text-sm text-[var(--st-text-secondary)] hover:text-white" onClick={() => setMobileMenuOpen(false)}>Home</Link>
              <Link to="/pricing" className="block text-sm text-[var(--st-text-secondary)] hover:text-white" onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
              <div className="pt-3 border-t border-[var(--st-border)] space-y-2">
                {isAuthenticated ? (
                  <button onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }} className="w-full py-2 rounded-xl bg-st-accent text-white font-semibold text-sm">Dashboard</button>
                ) : (
                  <>
                    <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} className="w-full py-2 rounded-xl text-white text-sm font-medium border border-[var(--st-border)]">Sign In</button>
                    <button onClick={() => { navigate('/register'); setMobileMenuOpen(false); }} className="w-full py-2 rounded-xl bg-st-accent text-white font-semibold text-sm">Get Started</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="pt-16">{children}</main>

      <footer className="border-t border-[var(--st-border)] bg-[var(--st-bg-card)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Logo size="sm" />
              <p className="mt-3 text-xs text-[var(--st-text-secondary)] leading-relaxed">Real-time binary options signals powered by advanced algorithms.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <div className="space-y-2">
                <Link to="/pricing" className="block text-xs text-[var(--st-text-secondary)] hover:text-white transition-colors">Pricing</Link>
                <Link to="/register" className="block text-xs text-[var(--st-text-secondary)] hover:text-white transition-colors">Get Started</Link>
                <Link to="/login" className="block text-xs text-[var(--st-text-secondary)] hover:text-white transition-colors">Sign In</Link>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Resources</h4>
              <div className="space-y-2">
                <Link to="/pricing" className="block text-xs text-[var(--st-text-secondary)] hover:text-white transition-colors">FAQ</Link>
                <span className="block text-xs text-[var(--st-text-secondary)] cursor-default">Chrome Extension</span>
                <span className="block text-xs text-[var(--st-text-secondary)] cursor-default">API Docs</span>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Legal</h4>
              <div className="space-y-2">
                <span className="block text-xs text-[var(--st-text-secondary)] cursor-default">Privacy Policy</span>
                <span className="block text-xs text-[var(--st-text-secondary)] cursor-default">Terms of Service</span>
                <span className="block text-xs text-[var(--st-text-secondary)] cursor-default">Risk Disclosure</span>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-[var(--st-border)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[var(--st-text-secondary)]">© {new Date().getFullYear()} SnapTrade. All rights reserved. Trading involves risk.</p>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[var(--st-text-secondary)]">₿ BTC</span>
                <span className="text-xs text-[var(--st-text-secondary)]">Ξ ETH</span>
                <span className="text-xs text-[var(--st-text-secondary)]">₮ USDT</span>
                <span className="text-xs text-[var(--st-text-secondary)]">🅿 PayPal</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
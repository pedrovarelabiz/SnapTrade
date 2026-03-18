import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/shared/Logo';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-st-accent/8 rounded-full blur-[100px]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <Logo size="lg" />
          </Link>
          <p className="text-[var(--st-text-secondary)] mt-3">Sign in to your account</p>
        </div>

        <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-st-put/10 border border-st-put/30 text-st-put text-sm">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-12 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)] hover:text-white">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-[var(--st-text-secondary)]">
                <input type="checkbox" className="rounded border-[var(--st-border)] bg-[var(--st-bg-elevated)]" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm text-st-accent hover:text-st-accent/80">Forgot password?</Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--st-text-secondary)]">
              Don't have an account?{' '}
              <Link to="/register" className="text-st-accent hover:text-st-accent/80 font-medium">Sign up</Link>
            </p>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)]">
            <p className="text-xs text-[var(--st-text-secondary)] text-center mb-2">Quick demo login:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                { label: 'Admin', email: 'admin@snaptrade.io' },
                { label: 'Premium', email: 'premium@snaptrade.io' },
                { label: 'Free', email: 'free@snaptrade.io' },
              ].map(demo => (
                <button
                  key={demo.label}
                  onClick={() => { setEmail(demo.email); setPassword('demo'); }}
                  className="px-3 py-1 rounded-lg bg-[var(--st-border)]/50 text-xs text-[var(--st-text-primary)] hover:bg-[var(--st-border)] transition-colors"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
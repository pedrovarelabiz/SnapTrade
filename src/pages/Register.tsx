import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/shared/Logo';
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!agreed) { setError('Please agree to the terms'); return; }
    setIsLoading(true);
    try {
      await register(name, email, password);
      toast.success('Account created successfully!');
      navigate('/verify-email');
    } catch {
      setError('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-st-info/8 rounded-full blur-[100px]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block"><Logo size="lg" /></Link>
          <p className="text-[var(--st-text-secondary)] mt-3">Create your free account</p>
        </div>

        <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-xl bg-st-put/10 border border-st-put/30 text-st-put text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  className="w-full pl-10 pr-12 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)] hover:text-white">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--st-text-primary)] mb-2">Confirm Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-[var(--st-text-secondary)]">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 rounded border-[var(--st-border)]" />
              <span>I agree to the <span className="text-st-accent">Terms of Service</span> and <span className="text-st-accent">Privacy Policy</span></span>
            </label>

            <button type="submit" disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--st-text-secondary)]">
              Already have an account? <Link to="/login" className="text-st-accent hover:text-st-accent/80 font-medium">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
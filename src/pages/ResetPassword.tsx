import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { Lock, CheckCircle } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block"><Logo size="lg" /></Link>
        </div>

        <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-6 sm:p-8">
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-st-call/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-st-call" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Password Reset!</h2>
              <p className="text-sm text-[var(--st-text-secondary)] mb-6">Your password has been updated successfully.</p>
              <button onClick={() => navigate('/login')} className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm">
                Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-2">Reset Password</h2>
              <p className="text-sm text-[var(--st-text-secondary)] mb-6">Enter your new password below.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="p-3 rounded-xl bg-st-put/10 border border-st-put/30 text-st-put text-sm">{error}</div>}
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
                </div>
                <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                  Reset Password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block"><Logo size="lg" /></Link>
        </div>

        <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-st-call/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-st-call" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Email Sent!</h2>
              <p className="text-sm text-[var(--st-text-secondary)] mb-6">Check your inbox for a password reset link.</p>
              <Link to="/login" className="text-st-accent text-sm font-medium hover:text-st-accent/80">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-2">Forgot Password?</h2>
              <p className="text-sm text-[var(--st-text-secondary)] mb-6">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--st-text-secondary)]" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] text-white text-sm placeholder:text-[var(--st-text-secondary)]/50 focus:outline-none focus:border-st-accent focus:ring-1 focus:ring-st-accent transition-colors" />
                </div>
                <button type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                  Send Reset Link
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link to="/login" className="inline-flex items-center gap-1 text-sm text-[var(--st-text-secondary)] hover:text-white">
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

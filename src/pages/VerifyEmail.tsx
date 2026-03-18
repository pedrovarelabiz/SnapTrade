import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/shared/Logo';
import { Mail, CheckCircle } from 'lucide-react';

export default function VerifyEmail() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--st-bg-deep)] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="relative w-full max-w-md text-center">
        <Link to="/" className="inline-block mb-8"><Logo size="lg" /></Link>

        <div className="rounded-2xl bg-[var(--st-bg-card)] border border-[var(--st-border)] p-8">
          <div className="w-16 h-16 rounded-full bg-st-call/10 flex items-center justify-center mx-auto mb-6">
            <Mail size={28} className="text-st-call" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Check Your Email</h1>
          <p className="text-sm text-[var(--st-text-secondary)] mb-6">
            We've sent a verification link to your email address. Click the link to activate your account.
          </p>

          <div className="p-4 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] mb-6">
            <div className="flex items-center gap-2 text-st-call text-sm">
              <CheckCircle size={16} />
              <span>For demo purposes, your email is already verified!</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-st-accent to-st-info text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

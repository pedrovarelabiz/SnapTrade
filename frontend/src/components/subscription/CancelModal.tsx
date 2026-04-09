import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const reasons = [
  'Too expensive',
  'Not enough signals',
  'Signal quality not satisfactory',
  'Found a better alternative',
  'Taking a break from trading',
  'Other',
];

export function CancelModal({ open, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--st-bg-card)] border-[var(--st-border)] text-white max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-st-put/10 flex items-center justify-center mx-auto mb-2">
            <AlertTriangle size={22} className="text-st-put" />
          </div>
          <DialogTitle className="text-center text-white">Cancel Subscription?</DialogTitle>
          <DialogDescription className="text-center text-[var(--st-text-secondary)]">
            You'll lose access to premium features at the end of your billing period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <p className="text-sm font-medium text-[var(--st-text-primary)]">Why are you cancelling?</p>
          <div className="space-y-2">
            {reasons.map(r => (
              <label key={r} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] cursor-pointer hover:border-st-accent/30 transition-colors">
                <input
                  type="radio"
                  name="cancel-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="text-st-accent"
                />
                <span className="text-sm text-[var(--st-text-primary)]">{r}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--st-border)] text-white text-sm font-medium hover:bg-[var(--st-border)]/30 transition-colors">
            Keep Subscription
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason}
            className="flex-1 py-2.5 rounded-xl bg-st-put text-white text-sm font-semibold hover:bg-st-put/90 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

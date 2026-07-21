import * as React from 'react';
import { Bot } from 'lucide-react';
import { AiPlanner } from '@/components/AiPlanner';
import { track } from '@/lib/analytics';

/**
 * The assistant as a floating action button present on every screen, rather
 * than a nav tab. Help is always one click away (recognition over recall) and
 * the top nav stays focused on the two core jobs. Opening from a dashboard
 * nudge (seeded question) or the button both land here.
 */
export function AssistantWidget({
  open,
  onOpenChange,
  seed,
  onSeedConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed: string | null;
  onSeedConsumed: () => void;
}) {
  // Esc closes the panel — expected of any transient overlay.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/10 animate-fade-in"
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      ) : null}

      {/* The panel stays mounted and is only hidden when closed, so the
          conversation persists across open/close within a session. `hidden`
          removes it from layout and the accessibility tree while preserving
          AiPlanner's message state. */}
      <div
        role="dialog"
        aria-label="Escape Plan assistant"
        hidden={!open}
        className="fixed bottom-4 right-4 z-50 w-[min(28rem,calc(100vw-2rem))]"
      >
        <AiPlanner
          seedQuestion={seed}
          onSeedConsumed={onSeedConsumed}
          onClose={() => onOpenChange(false)}
        />
      </div>

      {open ? null : (
        <button
          type="button"
          onClick={() => {
            onOpenChange(true);
            track('assistant_opened', { via: 'fab' });
          }}
          aria-label="Ask the assistant"
          className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}
    </>
  );
}

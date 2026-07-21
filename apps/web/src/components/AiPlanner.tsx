import * as React from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePlanner } from '@/store/planner';
import { SUGGESTED_QUESTIONS, answer } from '@/lib/assistant';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export function AiPlanner({
  seedQuestion,
  onSeedConsumed,
}: {
  /** A question handed in from elsewhere (e.g. a dashboard nudge) to ask on open. */
  seedQuestion?: string | null;
  onSeedConsumed?: () => void;
} = {}) {
  const { input, result, aiEnabled, setAiEnabled } = usePlanner();
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: 'assistant',
      text: 'Ask me anything about your leave plan. I answer from the deterministic engine — no data leaves your browser.',
    },
  ]);
  const [draft, setDraft] = React.useState('');

  const ask = (q: string) => {
    if (!q.trim()) return;
    const reply = answer(q, input, result);
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: reply }]);
    setDraft('');
  };

  // If we arrived here from a nudge, ask the staged question once and clear it.
  // The ref makes this idempotent under StrictMode's double-invoked effects,
  // while resetting on a falsy seed so the same question can be asked again later.
  const askedSeed = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!seedQuestion) {
      askedSeed.current = null;
      return;
    }
    if (askedSeed.current === seedQuestion) return;
    askedSeed.current = seedQuestion;
    ask(seedQuestion);
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuestion]);

  return (
    <Card glass className="animate-fade-in">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/12 p-2 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Ask Escape Plan</CardTitle>
            <p className="text-sm text-muted-foreground">
              {aiEnabled
                ? 'AI rephrasing ON — answers still computed by the engine.'
                : 'Engine-powered answers (LLM flag off).'}
            </p>
          </div>
        </div>
        {/* The AI on/off control lives here, where its effect is visible, rather
            than as a global header toggle competing for attention on every tab. */}
        <label htmlFor="ai-toggle" className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          <Label htmlFor="ai-toggle" className="cursor-pointer text-sm text-muted-foreground">
            {aiEnabled ? 'AI on' : 'Deterministic'}
          </Label>
          <Switch
            id="ai-toggle"
            checked={aiEnabled}
            onCheckedChange={setAiEnabled}
            aria-label="Toggle AI rephrasing"
          />
        </label>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3"
          role="log"
          aria-live="polite"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-card-foreground border border-border'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((s) => (
            <button
              key={s.q}
              type="button"
              onClick={() => ask(s.q)}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {s.q}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Best time to visit Crete?"
            aria-label="Ask a question about your plan"
          />
          <Button type="submit" size="icon" aria-label="Send question">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

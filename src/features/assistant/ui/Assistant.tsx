import {
  Button,
  ChatMessage,
  ChatThread,
  Composer,
  Drawer,
  Icon,
  IconButton,
  Markdown,
  Suggestions,
} from '@kete/design';
import { Link, useLocation } from '@tanstack/react-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ErrorNote } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';
import type { AssistantEvent, Turn } from '../ask';
import { fetchAsking, transcribeQuestion } from '../functions';
import { sourcePlaces, sourceWords, suggestionsFor } from './words';

// The assistant, one touch from every screen (specs/020-assistant): a conversation that is kept
// while the person moves in the app, an answer written as it comes, where it comes from — to
// open —, and the gestures it prepared, which do nothing until she confirms them.

interface Exchange {
  id: number;
  question: string;
  answer: string;
  sources: string[];
  prepared: { name: string; draftId: string }[];
  state: 'writing' | 'done' | 'failed';
  failure: string;
}

interface Asking {
  allowed: boolean;
  connected: boolean;
  voice: boolean;
}

interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
  asking: Asking | null;
  exchanges: Exchange[];
  busy: boolean;
  ask: (question: string) => void;
  stop: () => void;
  clear: () => void;
}

const Context = createContext<AssistantState | null>(null);

const failures: Record<string, () => string> = {
  not_connected: m.ask_not_connected_body,
  budget_spent: m.ask_budget_spent,
  failed: m.assistant_failed,
};

/** Keeps the conversation for as long as the person stays in the app. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | null>(null);
  const next = useRef(1);

  // Whether a model is connected is asked once, when the assistant is first needed.
  const needed = open || pathname === '/demander';
  useEffect(() => {
    if (!needed || asking) return;
    let alive = true;
    void fetchAsking().then((answer) => {
      if (alive) setAsking(answer);
    });
    return () => {
      alive = false;
    };
  }, [needed, asking]);

  const change = useCallback((id: number, update: (exchange: Exchange) => Exchange) => {
    setExchanges((current) => current.map((exchange) => (exchange.id === id ? update(exchange) : exchange)));
  }, []);

  const ask = useCallback(
    (question: string) => {
      const asked = question.trim();
      if (asked.length < 2 || busy) return;
      const id = next.current++;
      const history: Turn[] = exchanges
        .filter((exchange) => exchange.state === 'done')
        .flatMap((exchange) => [
          { role: 'user' as const, text: exchange.question },
          { role: 'assistant' as const, text: exchange.answer },
        ]);
      setExchanges((current) => [
        ...current,
        { id, question: asked, answer: '', sources: [], prepared: [], state: 'writing', failure: '' },
      ]);
      setBusy(true);
      const controller = new AbortController();
      running.current = controller;
      const fail = (reason: string) =>
        change(id, (exchange) => ({ ...exchange, state: 'failed', failure: (failures[reason] ?? m.assistant_failed)() }));
      const handle = (event: AssistantEvent) => {
        if (event.type === 'text') change(id, (e) => ({ ...e, answer: e.answer + event.delta }));
        else if (event.type === 'reading') {
          change(id, (e) => (e.sources.includes(event.name) ? e : { ...e, sources: [...e.sources, event.name] }));
        } else if (event.type === 'prepared') {
          change(id, (e) => ({ ...e, prepared: [...e.prepared, { name: event.name, draftId: event.draftId }] }));
        } else if (event.type === 'unavailable') fail(event.reason);
        else change(id, (e) => (e.state === 'writing' ? { ...e, state: 'done' } : e));
      };
      void (async () => {
        try {
          const response = await fetch('/api/assistant', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question: asked, history, screen: pathname }),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) return fail(response.status === 403 ? 'not_allowed' : 'failed');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            for (const line of lines) if (line.trim()) handle(JSON.parse(line) as AssistantEvent);
          }
          // A stream that ended without saying so: what was written stays.
          change(id, (e) => (e.state === 'writing' ? { ...e, state: 'done' } : e));
        } catch {
          // Stopped by the person: what was written stays, as it is.
          if (controller.signal.aborted) change(id, (e) => ({ ...e, state: 'done' }));
          else fail('failed');
        } finally {
          setBusy(false);
          running.current = null;
        }
      })();
    },
    [busy, change, exchanges, pathname],
  );

  const value = useMemo<AssistantState>(
    () => ({
      open,
      setOpen,
      asking,
      exchanges,
      busy,
      ask,
      stop: () => running.current?.abort(),
      clear: () => setExchanges([]),
    }),
    [open, asking, exchanges, busy, ask],
  );
  return (
    <Context.Provider value={value}>
      {children}
      <AssistantPanel />
    </Context.Provider>
  );
}

function useAssistant(): AssistantState {
  const state = useContext(Context);
  if (!state) throw new Error('The assistant is used outside its provider.');
  return state;
}

/** The button that opens the assistant, in the frame of every screen. */
export function AssistantLauncher() {
  const { setOpen } = useAssistant();
  return (
    <Button variant="secondary" onClick={() => setOpen(true)}>
      <Icon name="sparkle" />
      {m.assistant_open()}
    </Button>
  );
}

function AssistantPanel() {
  const { open, setOpen, exchanges, clear } = useAssistant();
  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={m.assistant_title()}
      closeLabel={m.assistant_close()}
      footer={
        exchanges.length > 0 ? (
          <button type="button" className="text-body-sm text-link underline" onClick={clear}>
            {m.assistant_clear()}
          </button>
        ) : undefined
      }
    >
      {/* Only while it is open: closed, the conversation is kept, not drawn twice. */}
      {open && <AssistantThread onNavigate={() => setOpen(false)} />}
    </Drawer>
  );
}

/** The conversation itself: in the panel, and on the « Demander » page. */
export function AssistantThread({
  permissions,
  onNavigate,
}: {
  /** What the person holds: her suggestions follow it. Read from the frame when absent. */
  permissions?: string[];
  onNavigate?: () => void;
}) {
  const { asking, exchanges, busy, ask, stop } = useAssistant();
  const { pathname } = useLocation();
  const held = useHeld(permissions);
  const [question, setQuestion] = useState('');
  const [listening, setListening] = useState<'idle' | 'recording' | 'hearing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  if (!asking) return <p className="text-fg-muted">{m.assistant_loading()}</p>;
  if (!asking.allowed) return <p className="text-fg-muted">{m.error_not_allowed()}</p>;
  if (!asking.connected) {
    return (
      <div>
        <p className="font-semibold">{m.ask_not_connected_title()}</p>
        <p className="mt-1 text-fg-muted">{m.ask_not_connected_body()}</p>
      </div>
    );
  }

  const send = (text: string) => {
    setError(null);
    setQuestion('');
    ask(text);
  };

  async function record() {
    if (listening === 'recording') {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      next.ondataavailable = (event) => chunks.push(event.data);
      next.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        const reader = new FileReader();
        // The recording is read once, sent, and never kept.
        reader.onloadend = () => {
          setListening('hearing');
          void transcribeQuestion({ data: { audio: String(reader.result).split(',')[1] ?? '' } })
            .then((heard) => {
              if (heard.text) send(heard.text);
              else setError(m.dictate_nothing_heard());
            })
            .catch(() => setError(m.assistant_failed()))
            .finally(() => setListening('idle'));
        };
        reader.readAsDataURL(new Blob(chunks, { type: next.mimeType }));
      };
      recorder.current = next;
      next.start();
      setListening('recording');
    } catch {
      setError(m.dictate_mic_refused());
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        {exchanges.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-fg-muted">{m.assistant_intro()}</p>
            <Suggestions label={m.ask_suggestions()} items={suggestionsFor(held, pathname)} onSelect={send} />
          </div>
        ) : (
          <ChatThread label={m.assistant_title()}>
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="flex flex-col gap-3">
                <ChatMessage role="user">{exchange.question}</ChatMessage>
                <ChatMessage
                  role="assistant"
                  author={m.app_name()}
                  actions={
                    exchange.sources.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
                        <span>{m.assistant_sources()}</span>
                        {exchange.sources.map((source) => {
                          const label = (sourceWords[source] ?? (() => source))();
                          const place = sourcePlaces[source];
                          return place ? (
                            <Link key={source} to={place} onClick={onNavigate} className="text-link underline">
                              {label}
                            </Link>
                          ) : (
                            <span key={source}>{label}</span>
                          );
                        })}
                      </span>
                    ) : undefined
                  }
                >
                  {exchange.answer ? (
                    <Markdown text={exchange.answer} />
                  ) : exchange.state === 'writing' ? (
                    <span className="text-fg-muted">{m.ask_thinking()}</span>
                  ) : null}
                  {exchange.state === 'failed' && <ErrorNote>{exchange.failure}</ErrorNote>}
                  {exchange.prepared.map((gesture) => (
                    <div
                      key={gesture.draftId}
                      className="mt-3 rounded-box border border-line-strong bg-surface p-3"
                    >
                      <p className="text-body-sm font-semibold">{m.assistant_prepared()}</p>
                      <p className="mt-1 text-body-sm text-fg-muted">{m.assistant_prepared_hint()}</p>
                      <Link
                        to="/verification/$draftId"
                        params={{ draftId: gesture.draftId }}
                        onClick={onNavigate}
                        className="mt-3 inline-flex h-(--control-height) items-center rounded-control bg-action px-(--control-padding) font-semibold text-on-action"
                      >
                        {m.assistant_review()}
                      </Link>
                    </div>
                  ))}
                </ChatMessage>
              </div>
            ))}
          </ChatThread>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Composer
              label={m.ask_question()}
              placeholder={listening === 'hearing' ? m.dictate_thinking() : m.assistant_placeholder()}
              value={question}
              onChange={setQuestion}
              onSend={() => send(question)}
              onStop={stop}
              busy={busy}
              sendLabel={m.ask_submit()}
              stopLabel={m.dictate_stop()}
            />
          </div>
          {asking.voice && (
            <span className="pb-3">
              <IconButton
                label={listening === 'recording' ? m.dictate_stop() : m.assistant_speak()}
                disabled={busy || listening === 'hearing'}
                onClick={() => void record()}
              >
                <Icon name={listening === 'recording' ? 'stop' : 'mic'} />
              </IconButton>
            </span>
          )}
        </div>
        <p className="text-body-sm text-fg-muted">{m.assistant_how()}</p>
      </div>
    </div>
  );
}

/** What the person holds, given by the page or by the frame around it. */
const Held = createContext<string[]>([]);
export const HeldPermissions = Held.Provider;
function useHeld(given?: string[]): string[] {
  const fromFrame = useContext(Held);
  return given ?? fromFrame;
}

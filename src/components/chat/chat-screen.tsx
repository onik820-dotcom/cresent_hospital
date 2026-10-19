import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check, Loader2, Mic, Send, Trash2 } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { useVoiceInput } from '@/components/chat/voice-input';
import { chatTurn } from '@/lib/chat/agent.functions';
import { applyProposal } from '@/lib/chat/confirm';
import type { Proposal } from '@/lib/chat/proposals';
import type { Role } from '@/lib/roles';

/**
 * The assistant, as a page of its own.
 *
 * It answers from the books and it prepares work, but a write only happens
 * when the person taps the card. Nothing the model says is ever the write.
 */

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS: Record<'bn' | 'en', Record<'read' | 'write', string[]>> = {
  bn: {
    read: ['আজ কত বিক্রি হলো?', 'ট্যাংক ২-এ কত আছে?', 'এই মাসের লাভ কত?'],
    write: ['টিফিনে ৫০০ টাকা খরচ লিখুন', 'শাহ মামুনের ২০০০ টাকা জমা নিন', 'শেষ খরচটা বাদ দিন'],
  },
  en: {
    read: ['How much did we sell today?', 'What is in tank 2?', 'Profit this month?'],
    write: ['Record 500 taka for tiffin', 'Receive 2000 from Shah Mamun', 'Remove the last expense'],
  },
};

export function ChatScreen({ role, fullName }: { role: Role; fullName: string }) {
  const { lang } = useLang();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const readOnly = role === 'md';

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem('jhm.chat.session');
      if (saved) {
        setSessionId(saved);
        return;
      }
    } catch {
      /* private browsing */
    }
    const fresh = crypto.randomUUID();
    setSessionId(fresh);
    try {
      window.sessionStorage.setItem('jhm.chat.session', fresh);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy, proposal]);

  useEffect(() => {
    boxRef.current?.focus();
  }, [busy]);

  const say = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !sessionId) return;

      setDraft('');
      setNotice(null);
      setProposal(null);
      setTurns((t) => [...t, { id: crypto.randomUUID(), role: 'user', content: trimmed }]);
      setBusy(true);

      try {
        const body = (await chatTurn({ data: { session_id: sessionId, message: trimmed, lang } })) as {
          reply: string;
          proposal: Proposal | null;
        };
        setTurns((t) => [
          ...t,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: body.reply || (lang === 'bn' ? 'উত্তর পাওয়া যায়নি।' : 'No answer came back.'),
          },
        ]);
        if (body.proposal) setProposal(body.proposal);
      } catch {
        setTurns((t) => [
          ...t,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              lang === 'bn'
                ? 'সংযোগ পাওয়া গেল না। সব হিসাব স্ক্রিনে আছে।'
                : 'I could not reach the server. Every figure is still on the screens.',
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, lang, sessionId],
  );

  const voice = useVoiceInput({
    lang,
    onText: (text: string) => void say(text),
    onError: (message: string) => setNotice(message),
  });

  async function confirm() {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      const result = await applyProposal(proposal);
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.ok
            ? lang === 'bn'
              ? 'লেখা হয়েছে।'
              : 'Done — that is recorded.'
            : (result.error ?? (lang === 'bn' ? 'লেখা গেল না।' : 'That could not be saved.')),
        },
      ]);
      if (result.ok) setProposal(null);
    } finally {
      setBusy(false);
    }
  }

  const listening = voice.state === 'listening' || voice.state === 'recording';
  const starters = [...SUGGESTIONS[lang].read, ...(readOnly ? [] : SUGGESTIONS[lang].write)];

  return (
    <GlassCard lift={false} className="flex h-[calc(100vh-11rem)] min-h-[28rem] flex-col p-0">
      {/* ---- thread ---- */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {turns.length === 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-sm font-semibold tracking-tight" lang={lang}>
              {lang === 'bn' ? `স্বাগতম, ${fullName}` : `Hello, ${fullName}`}
            </p>
            <Muted lang={lang}>
              {readOnly
                ? lang === 'bn'
                  ? 'পাম্পের যেকোনো হিসাব জিজ্ঞাসা করুন — বাংলায় বা ইংরেজিতে। এই অ্যাকাউন্ট শুধু দেখার।'
                  : 'Ask about any figure at the pump, in Bangla or English. This account is read-only.'
                : lang === 'bn'
                  ? 'হিসাব জিজ্ঞাসা করুন, বা বলুন কী লিখতে, বদলাতে বা বাদ দিতে হবে। নিশ্চিত না করা পর্যন্ত কিছুই লেখা হয় না।'
                  : 'Ask about the books, or say what to record, change or remove. Nothing is written until you confirm it.'}
            </Muted>
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void say(s)}
                  lang={lang}
                  className="tap-target rounded-xl border px-3 py-2 text-left text-xs"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <p
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm"
              lang={lang}
              style={
                turn.role === 'user'
                  ? { background: 'var(--color-accent)', color: 'white' }
                  : { color: 'var(--text-strong)' }
              }
            >
              {turn.content}
            </p>
          </div>
        ))}

        {busy ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--text-faint)' }} aria-hidden />
            <Muted lang={lang}>{lang === 'bn' ? 'দেখছি…' : 'Looking…'}</Muted>
          </div>
        ) : null}

        {/* ---- the card that has to be tapped ---- */}
        {proposal ? (
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-accent)' }}>
            <p className="flex items-center gap-2 text-sm font-semibold" lang={lang}>
              {proposal.kind === 'record.void' ? (
                <Trash2 className="h-4 w-4" style={{ color: 'var(--color-breach)' }} aria-hidden />
              ) : null}
              {lang === 'bn' ? proposal.summary.bn : proposal.summary.en}
            </p>
            {proposal.fields.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {proposal.fields.map((f) => (
                    <tr key={f.label.en}>
                      <td className="py-0.5 pr-2" style={{ color: 'var(--text-faint)' }} lang={lang}>
                        {lang === 'bn' ? f.label.bn : f.label.en}
                      </td>
                      <td className="tabular py-0.5 text-right font-medium">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <Muted className="mt-2" lang={lang}>
              {lang === 'bn'
                ? 'নিশ্চিত না করা পর্যন্ত কিছুই লেখা হবে না।'
                : 'Nothing is saved until you confirm.'}
            </Muted>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="tap-target flex-1 rounded-lg border px-3 py-2 text-xs font-medium"
                style={{ borderColor: 'var(--hairline)' }}
                lang={lang}
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              {proposal.kind === 'shift.close' ? (
                <button
                  type="button"
                  onClick={() => {
                    setProposal(null);
                    navigate({ to: '/shift/close' });
                  }}
                  className="tap-target flex-1 rounded-lg px-3 py-2 text-xs font-medium"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                  lang={lang}
                >
                  {lang === 'bn' ? 'বন্ধের পাতায় যান' : 'Go to the close'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className="tap-target flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40"
                  style={{
                    background:
                      proposal.kind === 'record.void' ? 'var(--color-breach)' : 'var(--color-accent)',
                    color: 'white',
                  }}
                  lang={lang}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {lang === 'bn' ? 'নিশ্চিত করুন' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* ---- input ---- */}
      <div className="shrink-0 border-t px-3 py-2.5 sm:px-5" style={{ borderColor: 'var(--hairline)' }}>
        {notice ? (
          <p className="state-watch mb-1.5 text-xs" lang={lang}>
            {notice}
          </p>
        ) : null}
        {listening ? (
          <div className="mb-1.5 flex items-center gap-2">
            <Chip tone="ok" lang={lang}>
              {voice.state === 'recording'
                ? lang === 'bn'
                  ? 'রেকর্ড হচ্ছে'
                  : 'Recording'
                : lang === 'bn'
                  ? 'শুনছি'
                  : 'Listening'}
            </Chip>
            <Muted className="truncate">{voice.interim}</Muted>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={voice.start}
            disabled={busy || voice.state === 'transcribing'}
            aria-label={lang === 'bn' ? 'কথা বলুন' : 'Speak'}
            aria-pressed={listening}
            className="tap-target shrink-0 rounded-full p-2.5 disabled:opacity-40"
            style={
              listening
                ? { background: 'var(--color-breach)', color: 'white' }
                : { border: '1px solid var(--hairline)', color: 'var(--text-muted)' }
            }
          >
            {voice.state === 'transcribing' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Mic className="h-4 w-4" aria-hidden />
            )}
          </button>

          <textarea
            ref={boxRef}
            value={draft}
            aria-label={lang === 'bn' ? 'প্রশ্ন লিখুন' : 'Ask a question'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void say(draft);
              }
            }}
            rows={1}
            lang={lang}
            placeholder={
              readOnly
                ? lang === 'bn'
                  ? 'হিসাব জিজ্ঞাসা করুন…'
                  : 'Ask about the books…'
                : lang === 'bn'
                  ? 'জিজ্ঞাসা করুন বা কাজ বলুন…'
                  : 'Ask, or say what to do…'
            }
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--hairline)' }}
          />

          <button
            type="button"
            onClick={() => void say(draft)}
            disabled={busy || !draft.trim()}
            aria-label={lang === 'bn' ? 'পাঠান' : 'Send'}
            className="tap-target shrink-0 rounded-full p-2.5 disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

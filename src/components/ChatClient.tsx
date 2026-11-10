'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Md from './Md';
import { linkCitations, readChatEvents, type SourceRef } from '@/lib/chat-contract';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceRef[];
  cited?: string[];
  status?: 'complete' | 'working' | 'interrupted' | 'search';
  notice?: string;
}
const SUGGESTIONS = [
  { label: 'Draft a message', question: 'Help me draft a short, friendly follow-up to a colleague. Ask me what I need from them.' },
  { label: 'Make a checklist', question: 'Help me turn a task into a practical checklist. Ask me what the task is.' },
  { label: 'Find a process', question: 'Help me find the approved process for my task. Ask me what I need to do.' },
  { label: 'Find who can help', question: 'Help me find who is responsible for something at Radhiant. Ask me what I need help with.' },
];
const SEARCH_SUGGESTIONS = [
  { label: 'Find a process', question: 'file naming process' },
  { label: 'Find who can help', question: 'people roles responsibilities' },
];

export default function ChatClient({ aiOn }: { aiOn: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [problem, setProblem] = useState<number | null>(null);
  const [correction, setCorrection] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (nearBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' }); }, [messages]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setAnnouncement(label); }
    catch { setAnnouncement('Copy was unavailable. Please select the text and copy it.'); }
  }
  async function send(text: string, retryIndex?: number) {
    const question = text.trim();
    if (!question || question.length > 8000 || busy) return;
    setInput(''); setBusy(true); setAnnouncement('Preparing your answer.'); nearBottom.current = true;
    const before = retryIndex === undefined ? messages : messages.slice(0, retryIndex - 1);
    const history: Msg[] = [...before, { role: 'user', content: question }];
    let answer: Msg = { role: 'assistant', content: '', status: 'working' };
    const update = () => setMessages([...history, { ...answer }]);
    update();
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const wire = history.filter(m => m.role === 'user' || m.status === 'complete').slice(-20)
        .map(({ role, content }) => ({ role, content }));
      while (wire.length > 1 && wire.reduce((n, m) => n + m.content.length, 0) > 60000) wire.shift();
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: wire }), signal: controller.signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        answer.notice = typeof data.error === 'string' ? data.error : 'The answer could not start. Please retry.';
        throw new Error('Request failed');
      }
      if (res.headers.get('Content-Type')?.includes('application/json')) {
        const data = await res.json();
        answer = { role: 'assistant', content: data.answer, sources: data.sources, status: 'search' }; update();
      } else {
        if (!res.body) throw new Error('Empty response');
        await readChatEvents(res.body, event => {
          if (event.type === 'sources') answer.sources = event.sources;
          if (event.type === 'text') answer.content += event.text;
          if (event.type === 'done') {
            answer.cited = event.cited;
            answer.status = event.incomplete ? 'interrupted' : 'complete';
            if (event.incomplete) answer.notice = 'This answer reached its length limit. Ask for the next part, or retry a narrower question.';
          }
          if (event.type === 'error') { answer.status = 'interrupted'; answer.notice = event.message; }
          update();
        });
      }
    } catch {
      answer.status = 'interrupted';
      answer.notice = controller.signal.aborted ? 'Stopped. This answer is incomplete.'
        : answer.notice || 'The connection was interrupted. Your question is ready to retry.';
      update();
    } finally {
      if (answer.status === 'interrupted') setInput(current => current || question);
      setBusy(false); abortRef.current = null;
      setAnnouncement(answer.status === 'interrupted' ? 'Answer incomplete. Retry is available.' : 'Answer ready.');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-dvh">
      <div className="border-b border-night-100 bg-white px-4 md:px-8 py-4 flex justify-between gap-3">
        <div><h1 className="text-xl font-bold text-night">Ask the Brain</h1>
          <p className="text-sm text-night-700">{aiOn ? 'Find an answer, draft a message or work out your next step.' : 'Search approved knowledge. Chat is currently unavailable.'}</p></div>
        <button type="button" disabled={busy || !messages.length} className="text-sm shrink-0 underline disabled:opacity-40"
          onClick={() => { setMessages([]); setInput(''); setProblem(null); setAnnouncement('Conversation cleared.'); inputRef.current?.focus(); }}>New chat</button>
      </div>
      <p role="status" className="sr-only">{announcement}</p>
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6" onScroll={e => {
        const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      }}>
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.length === 0 && <div className="py-8">
            <h2 className="text-lg font-semibold text-night">What do you need a hand with?</h2>
            <p className="text-sm text-night-700 mt-2 mb-5">Use your own words, or start here.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{(aiOn ? SUGGESTIONS : SEARCH_SUGGESTIONS).map(s => (
              <button key={s.label} onClick={() => { setInput(s.question); inputRef.current?.focus(); }} className="text-left bg-white border border-night-100 rounded-xl px-4 py-3 hover:border-ember">{s.label}</button>
            ))}</div>
            <p className="text-xs text-night-700 mt-6">Your conversation stays in this page and clears when you leave or refresh. The app records usage counts and which entries were retrieved, without recording question or answer text. Questions sent for AI answers are processed by the AI provider.</p>
          </div>}
          {messages.map((m, i) => <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={m.role === 'user' ? 'bg-night text-white rounded-2xl px-4 py-3 max-w-[90%] text-sm whitespace-pre-wrap break-words'
              : 'bg-white border border-night-100 rounded-2xl px-4 md:px-5 py-4 w-full min-w-0 shadow-sm'}>
              {m.role === 'user' ? m.content : <>
                {m.content ? <Md allowExternalLinks={false}>{linkCitations(m.content, m.sources || [])}</Md>
                  : m.status === 'working' ? <p className="text-sm">Working on it…</p> : null}
                {m.notice && <p className="text-sm mt-3 p-3 rounded-lg bg-ember/10">{m.notice}</p>}
                {!!m.sources?.length && <details className="mt-3 text-xs" open={m.status === 'search' || m.status === 'interrupted'}>
                  <summary className="cursor-pointer">{m.cited?.length ? `Sources cited: ${m.cited.length}. Related reading: ${m.sources.length - m.cited.length}.` : 'Related entries to check'}</summary>
                  <ul className="mt-2 space-y-2">{m.sources.map(s => <li key={s.id}>
                    <Link href={`/knowledge/${encodeURIComponent(s.slug)}`} className="text-ember-600 underline">[{s.id}] {s.title}</Link>
                    <span className="block text-night-700">{s.section} · Reviewed {s.reviewed}{m.cited?.includes(s.id) ? ' · Cited in answer' : ' · Related reading'}</span>
                  </li>)}</ul>
                </details>}
                {m.status !== 'working' && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs">
                  {m.content && <button onClick={() => copy(m.content, 'Answer copied.')} className="underline">Copy answer</button>}
                  <button disabled={busy} onClick={() => send(messages[i - 1]?.content || '', i)} className="underline disabled:opacity-40">Retry question</button>
                  <button onClick={() => { setProblem(i); setCorrection(''); }} className="underline">Report a problem</button>
                </div>}
              </>}
            </div>
          </div>)}
          {problem !== null && <section aria-label="Prepare a correction note" className="bg-white border border-night-100 rounded-xl p-4">
            <h2 className="font-semibold">Prepare a correction note</h2>
            <p className="text-sm my-2">Describe what is wrong or missing. Copy this note to share with your manager for review. It is not sent or added to company knowledge automatically.</p>
            <label htmlFor="correction" className="text-sm">What needs checking? Leave out patient details.</label>
            <textarea id="correction" value={correction} onChange={e => setCorrection(e.target.value)} maxLength={2000} className="block border rounded-lg p-2 w-full mt-2" />
            <div className="flex gap-5 mt-3 text-sm"><button disabled={!correction.trim()} className="underline disabled:opacity-40" onClick={() => copy(
              `Radhiant Brain correction for review\n\n${correction}\n\nRelated entries: ${(messages[problem]?.sources || []).map(s => `${s.title} (${s.slug}), reviewed ${s.reviewed}`).join('; ') || 'None'}\n\nNo change is approved by this note.`, 'Correction note copied. Share it for review.')}>Copy correction note</button>
              <button className="underline" onClick={() => setProblem(null)}>Close</button></div>
          </section>}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-night-100 bg-white px-4 md:px-8 py-4">
        <form className="max-w-3xl mx-auto flex items-end gap-2" onSubmit={e => { e.preventDefault(); void send(input); }}>
          <label htmlFor="question" className="sr-only">Your question</label>
          <textarea id="question" ref={inputRef} value={input} maxLength={8000} rows={2} onChange={e => setInput(e.target.value)}
            placeholder="Tell me what you need help with…" className="flex-1 min-w-0 border border-night-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/50" />
          {busy ? <button type="button" onClick={() => abortRef.current?.abort()} className="bg-night text-white rounded-xl px-4 py-3 text-sm">Stop</button>
            : <button disabled={!input.trim()} className="bg-ember hover:bg-ember-600 text-white rounded-xl px-4 py-3 text-sm disabled:opacity-50">Send</button>}
        </form>
        <p className="max-w-3xl mx-auto text-xs text-night-700 mt-2">Internal use. Leave out patient details and passwords. Check sources before relying on a company instruction.</p>
      </div>
    </div>
  );
}

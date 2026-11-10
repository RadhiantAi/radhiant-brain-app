// Synthetic HTTP integration through the compiled Next app and Anthropic SDK.
// No live provider calls, real identities, business sources or stored credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import matter from 'gray-matter';

const dir = mkdtempSync(join(tmpdir(), 'rb-http-'));
const password = randomBytes(24).toString('hex');
const date = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
for (const [i, slug, audience, text] of [
  [1, 'people-and-roles', 'team', 'A synthetic coordinator handles checklist questions.'],
  [2, 'ceo-context', 'ceo', 'PRIVATECANARY: synthetic restricted context.'],
]) writeFileSync(join(dir, `${slug}.md`), matter.stringify(text, {
  brainEntryId: `RB-MEM-20261109-000${i}`, title: slug, category: 'Synthetic', audience,
  sensitivity: 'Internal', currentness: 'current', updated: date(-1), lastReviewedAt: date(-1),
  review_by: date(30), expiryAction: 'review', owner: 'Fixture owner', approvedBy: 'Fixture approver',
  reviewStatus: 'approved', sources: ['Synthetic fixture'], visibleInPortal: true, doNotRetrieveContext: false,
}));
let app;
let providerMode = 'success';
let lastProviderBody;
let providerClosed = false;
const mock = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  lastProviderBody = JSON.parse(raw);
  if (providerMode === 'fail') { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"type":"error","error":{"type":"api_error","message":"Synthetic failure"}}'); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const event = data => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  event({ type: 'message_start', message: { id: 'synthetic-message', type: 'message', role: 'assistant', model: 'synthetic', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Synthetic answer café ✓ [S1].' } });
  if (providerMode === 'hold') { res.on('close', () => { providerClosed = true; }); return; }
  event({ type: 'content_block_stop', index: 0 });
  event({ type: 'message_delta', delta: { stop_reason: providerMode === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } });
  event({ type: 'message_stop' }); res.end();
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const base = 'http://127.0.0.1:3042';
const checks = [];
async function start(ai) {
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3042'], {
    cwd: process.cwd(), env: { ...process.env, RB_KNOWLEDGE_DIR: dir, RB_SESSION_SECRET: randomBytes(32).toString('hex'),
      RB_TEAM_PASSCODE: password, RB_LEADERSHIP_PASSCODE: randomBytes(24).toString('hex'), RB_CEO_PASSCODE: randomBytes(24).toString('hex'),
      ANTHROPIC_API_KEY: ai ? 'synthetic-local-provider-only' : '', ANTHROPIC_BASE_URL: mockUrl }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('App start timeout')), 20000);
    app.stdout.on('data', b => { if (b.toString().includes('Ready')) { clearTimeout(timer); resolve(); } });
    app.once('exit', code => { clearTimeout(timer); reject(new Error(`App exited ${code}`)); });
  });
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Synthetic tester', passcode: password }) });
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}
async function stop() { if (app && app.exitCode === null) { const exited = once(app, 'exit'); app.kill(); await exited; } }
async function chat(cookie, content = 'coordinator checklist') {
  return fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ messages: [{ role: 'user', content }] }) });
}
try {
  let cookie = await start(false);
  const denied = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(denied.status, 401);
  const malformed = await fetch(base + '/api/chat', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"messages":{}}' }); assert.equal(malformed.status, 400);
  const cross = await fetch(base + '/api/chat', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://wrong.example', 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(cross.status, 403);
  checks.push('Unauthenticated, malformed and cross-origin requests rejected');
  assert.equal((await fetch(base + '/knowledge/ceo-context', { headers: { Cookie: cookie } })).status, 404);
  const search = await (await chat(cookie)).json(); assert.equal(search.mode, 'search'); assert.equal(search.sources[0].slug, 'people-and-roles'); assert.ok(!JSON.stringify(search).includes('PRIVATECANARY'));
  checks.push('Team direct access denied; fallback search contains only authorised fixture');
  const people = await (await fetch(base + '/people', { headers: { Cookie: cookie } })).text(); assert.ok(people.includes('synthetic coordinator')); assert.ok(!people.includes('Kimberly McKnight'));
  const glossary = await (await fetch(base + '/glossary', { headers: { Cookie: cookie } })).text();
  assert.ok(glossary.includes('Common abbreviations')); assert.ok(!glossary.includes('personal financing')); assert.ok(!glossary.includes('Mondays 15:00'));
  checks.push('Directories use governed knowledge; glossary omits private workstreams and obsolete schedules');
  await stop(); cookie = await start(true);
  const events = (await (await chat(cookie)).text()).trim().split('\n').map(JSON.parse);
  assert.equal(events[0].type, 'sources'); assert.ok(events.some(e => e.text?.includes('café ✓'))); assert.deepEqual(events.at(-1).cited, ['S1']); assert.equal(events.at(-1).incomplete, false);
  assert.ok(!lastProviderBody.system.includes('synthetic coordinator')); assert.ok(JSON.stringify(lastProviderBody.messages).includes('synthetic coordinator'));
  assert.ok(!JSON.stringify(lastProviderBody).includes('PRIVATECANARY'));
  checks.push('Real SDK stream emits sources, Unicode text and completion; references stay out of system instructions');
  providerMode = 'length'; const limited = (await (await chat(cookie)).text()).trim().split('\n').map(JSON.parse); assert.equal(limited.at(-1).incomplete, true);
  checks.push('Provider length limit is reported as incomplete');
  providerMode = 'fail'; const failed = (await (await chat(cookie)).text()).trim().split('\n').map(JSON.parse); assert.equal(failed.at(-1).type, 'error'); assert.ok(!JSON.stringify(failed).includes('Synthetic failure'));
  checks.push('Provider failure preserves source references and returns a safe terminal error');
  providerMode = 'hold'; const abort = new AbortController();
  const held = await fetch(base + '/api/chat', { method: 'POST', signal: abort.signal, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'coordinator' }] }) });
  const reader = held.body.getReader(); await reader.read(); await reader.read(); abort.abort();
  for (let n = 0; n < 30 && !providerClosed; n++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(providerClosed, true); checks.push('Client cancellation closes the upstream provider stream');
  console.log(JSON.stringify({ status: 'pass', checks }, null, 2));
} finally { await stop(); mock.closeAllConnections(); mock.close(); rmSync(dir, { recursive: true, force: true }); }

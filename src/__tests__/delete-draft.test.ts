import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

// Nep-API: geen netwerk. getFresh levert conversation en threads, delete telt aanroepen.
const fake = { conv: {} as any, threads: [] as any[], totalPages: 1, deleteCalls: [] as string[], post: jest.fn(), patch: jest.fn(), put: jest.fn() };
jest.mock('../utils/helpscout-client.js', () => ({
  helpScoutClient: {
    getFresh: jest.fn(async (ep: string) =>
      ep.endsWith('/threads') ? { _embedded: { threads: fake.threads }, page: { totalPages: fake.totalPages } } : fake.conv),
    delete: jest.fn(async (ep: string) => { fake.deleteCalls.push(ep); return 204; }),
    post: (...a: unknown[]) => fake.post(...a),
    patch: (...a: unknown[]) => fake.patch(...a),
    put: (...a: unknown[]) => fake.put(...a),
  },
}));

import { ToolHandler } from '../tools/index.js';
import { helpScoutClient } from '../utils/helpscout-client.js';

const PLACEHOLDER = '(Uitgaande e-mail - zie concept hieronder)';
const scaffold = { id: 1, type: 'customer', state: 'published', body: PLACEHOLDER };
const draft = { id: 2, type: 'reply', state: 'draft', body: 'Oude concepttekst' };
const REASON = 'vervangen door nieuw concept met actuele datum';

let logPath: string;
const handler = new ToolHandler();
const call = async (args: Record<string, unknown>) => {
  const r = await handler.callTool({ method: 'tools/call', params: { name: 'deleteDraft', arguments: args } } as any);
  const text = (r.content[0] as any).text;
  try { return JSON.parse(text); } catch { return { raw: text, isError: r.isError }; }
};
const logLines = () => (existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);

beforeEach(() => {
  logPath = join(mkdtempSync(join(tmpdir(), 'dd-')), 'log.jsonl');
  process.env.HELPSCOUT_DELETE_LOG = logPath;
  Object.assign(fake, { conv: { subject: 'Onderwerp', tags: [{ tag: 'ai-draft' }] }, threads: [scaffold, draft], totalPages: 1, deleteCalls: [] });
  (helpScoutClient.delete as jest.Mock).mockClear();
  (helpScoutClient.getFresh as jest.Mock).mockClear();
});

test('verwijdert een ai-draft-conceptconversatie en logt volledige tekst plus reden vooraf', async () => {
  const r = await call({ conversationId: '100', threadId: '2', reason: REASON });
  expect(r.deleted).toBe(true);
  expect(fake.deleteCalls).toEqual(['/conversations/100']);
  const [ahead, done] = logLines();
  expect(ahead.action).toBe('deleting');
  expect(ahead.callerReason).toBe(REASON);
  expect(ahead.drafts).toEqual([{ threadId: '2', text: 'Oude concepttekst' }]);
  expect(done.action).toBe('deleted_draft_conversation');
});

test.each([
  ['geen draft', { threads: [scaffold, { ...draft, state: 'published' }] }, /geen draft/],
  ['mist tag ai-draft (concept van Maarten)', { conv: { tags: [] } }, /ai-draft/],
  ['echte klantconversatie', { threads: [{ ...scaffold, body: 'Hallo, ik wil verkopen' }, draft] }, /echte conversation/],
  ['extra gepubliceerde reply', { threads: [scaffold, { id: 3, type: 'reply', state: 'published', body: 'x' }, draft] }, /echte conversation/],
  ['meerdere pagina threads', { totalPages: 2 }, /meer dan een pagina/],
  ['thread bestaat niet', { threads: [scaffold] }, /niet gevonden/],
])('weigert: %s', async (_n, patch, re) => {
  Object.assign(fake, patch);
  const r = await call({ conversationId: '100', threadId: '2', reason: REASON });
  expect(r.deleted).toBe(false);
  expect(r.reason).toMatch(re);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
  expect(logLines()[0].action).toBe('refused');
});

test('weigert zonder of met te korte reden, zonder API-aanroep', async () => {
  for (const reason of [undefined, 'kort']) {
    const r = await call({ conversationId: '100', threadId: '2', reason });
    expect(r.deleted).not.toBe(true);
  }
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
  expect(helpScoutClient.getFresh).not.toHaveBeenCalledWith('/conversations/100');
});

test('niets verwijderd als het log niet geschreven kan worden', async () => {
  const blocker = join(mkdtempSync(join(tmpdir(), 'dd-')), 'is-een-bestand');
  writeFileSync(blocker, '');
  process.env.HELPSCOUT_DELETE_LOG = join(blocker, 'log.jsonl'); // ENOTDIR
  const r = await call({ conversationId: '100', threadId: '2', reason: REASON });
  expect(r.deleted).not.toBe(true);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('verstuurt nooit iets: geen post, patch of put', async () => {
  await call({ conversationId: '100', threadId: '2', reason: REASON });
  expect(fake.post).not.toHaveBeenCalled();
  expect(fake.patch).not.toHaveBeenCalled();
  expect(fake.put).not.toHaveBeenCalled();
});

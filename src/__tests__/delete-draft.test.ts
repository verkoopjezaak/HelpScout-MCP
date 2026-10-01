import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

jest.mock('../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

// Nep-API: geen netwerk. getFresh levert conversation en threads (per aanroep te wijzigen), delete telt aanroepen.
const fake = {
  conv: {} as any, threads: [] as any[], totalPages: 1 as any, deleteStatus: 204,
  deleteCalls: [] as string[], threadReads: 0, afterFirstRead: null as null | (() => void),
  post: jest.fn(), patch: jest.fn(), put: jest.fn(),
};
jest.mock('../utils/helpscout-client.js', () => ({
  helpScoutClient: {
    getFresh: jest.fn(async (ep: string) => {
      if (!ep.endsWith('/threads')) return fake.conv;
      const r = { _embedded: { threads: fake.threads.map(t => ({ ...t })) }, page: { totalPages: fake.totalPages } };
      if (++fake.threadReads === 1 && fake.afterFirstRead) fake.afterFirstRead();
      return r;
    }),
    get: jest.fn(async () => ({ primaryCustomer: { id: 7 } })),
    delete: jest.fn(async (ep: string) => { fake.deleteCalls.push(ep); return fake.deleteStatus; }),
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
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

let dir: string;
const logPath = () => join(dir, 'log.jsonl');
const ledgerPath = () => join(dir, 'ledger.jsonl');
const addLedger = (threadId: number, body: string, conv = '100') =>
  writeFileSync(ledgerPath(), JSON.stringify({ conversationId: conv, threadId: String(threadId), bodySha256: sha(body) }) + '\n', { flag: 'a' });

const handler = new ToolHandler();
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await handler.callTool({ method: 'tools/call', params: { name, arguments: args } } as any);
  const text = (r.content[0] as any).text;
  try { return JSON.parse(text); } catch { return { raw: text, isError: r.isError }; }
};
const del = (args: Record<string, unknown> = {}) => call('deleteDraft', { conversationId: '100', threadId: '2', reason: REASON, ...args });
const logLines = () => (existsSync(logPath()) ? readFileSync(logPath(), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.HELPSCOUT_DELETE_LOG = logPath();
  process.env.HELPSCOUT_DRAFT_LEDGER = ledgerPath();
  Object.assign(fake, {
    conv: { id: 100, subject: 'Onderwerp', tags: [{ tag: 'ai-draft' }] }, threads: [scaffold, draft], totalPages: 1,
    deleteStatus: 204, deleteCalls: [], threadReads: 0, afterFirstRead: null,
  });
  addLedger(2, draft.body);
  (helpScoutClient.delete as jest.Mock).mockClear();
  (helpScoutClient.getFresh as jest.Mock).mockClear();
  fake.post.mockReset(); fake.patch.mockReset(); fake.put.mockReset();
});

test('verwijdert een ai-draft-conceptconversatie en logt volledige tekst plus reden vooraf', async () => {
  const r = await del();
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
  ['mist tag ai-draft (concept van Maarten)', { conv: { id: 100, tags: [] } }, /ai-draft/],
  ['echte klantconversatie', { threads: [{ ...scaffold, body: 'Hallo, ik wil verkopen' }, draft] }, /echte conversation/],
  ['extra gepubliceerde reply', { threads: [scaffold, { id: 3, type: 'reply', state: 'published', body: 'x' }, draft] }, /echte conversation/],
  ['meerdere pagina threads', { totalPages: 2 }, /paginering/],
  ['paginering ontbreekt', { totalPages: undefined }, /paginering/],
  ['thread bestaat niet', { threads: [scaffold] }, /niet gevonden/],
  ['draft zonder body', { threads: [scaffold, { id: 2, type: 'reply', state: 'draft', text: 'x' }] }, /body/],
  ['samengevoegde conversation (301 naar ander id)', { conv: { id: 999, tags: [{ tag: 'ai-draft' }] } }, /wijkt af/],
  ['concept door Maarten bewerkt in de UI', { threads: [scaffold, { ...draft, body: 'Maarten herschreef dit' }] }, /bewerkt/],
  ['tweede draft door Maarten toegevoegd', { threads: [scaffold, draft, { id: 5, type: 'reply', state: 'draft', body: 'van Maarten' }] }, /bewerkt/],
])('weigert: %s', async (_n, patch, re) => {
  Object.assign(fake, patch);
  const r = await del();
  expect(r.deleted).toBe(false);
  expect(r.reason).toMatch(re);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
  expect(logLines()[0].action).toBe('refused');
});

test('weigert zonder grootboek (draft van voor de grootboekinvoering)', async () => {
  writeFileSync(ledgerPath(), '');
  expect((await del()).deleted).toBe(false);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('weigert als de conversation verandert tussen controle en DELETE', async () => {
  fake.afterFirstRead = () => { fake.threads = [scaffold, { ...draft, state: 'published' }]; };
  const r = await del();
  expect(r.deleted).toBe(false);
  expect(r.reason).toMatch(/veranderd/);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('DELETE met andere status dan 204 telt niet als verwijderd', async () => {
  fake.deleteStatus = 404;
  const r = await del();
  expect(r.deleted).toBe(false);
  expect(logLines().pop().action).toBe('delete_failed');
});

test('weigert zonder of met te korte reden, zonder API-aanroep', async () => {
  for (const reason of [undefined, 'kort']) expect((await del({ reason })).deleted).not.toBe(true);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
  expect(helpScoutClient.getFresh).not.toHaveBeenCalled();
});

test('niets verwijderd als het log niet geschreven kan worden', async () => {
  const blocker = join(dir, 'is-een-bestand');
  writeFileSync(blocker, '');
  process.env.HELPSCOUT_DELETE_LOG = join(blocker, 'log.jsonl'); // ENOTDIR
  expect((await del()).deleted).not.toBe(true);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('deleteDraft verstuurt nooit iets: geen post, patch of put', async () => {
  await del();
  expect(fake.post).not.toHaveBeenCalled();
  expect(fake.patch).not.toHaveBeenCalled();
  expect(fake.put).not.toHaveBeenCalled();
});

test('createDraftConversation legt de draft vast in het grootboek, daarna is hij te verwijderen', async () => {
  writeFileSync(ledgerPath(), '');
  fake.post.mockImplementation(async (ep: string) => (ep === '/conversations' ? { id: 100 } : {}));
  fake.threads = [scaffold, { ...draft, body: '<p>Nieuw concept</p>' }];
  await call('createDraftConversation', { mailboxId: '1', subject: 'Onderwerp', recipientEmail: 'a@b.nl', text: 'Nieuw concept', tags: ['ai-draft'] });
  expect(readFileSync(ledgerPath(), 'utf8')).toContain(sha('<p>Nieuw concept</p>'));
  fake.post.mockReset();
  expect((await del()).deleted).toBe(true);
});

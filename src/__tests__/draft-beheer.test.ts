import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

// Nep-API: geen netwerk. getFresh levert conversation en threads (per aanroep te wijzigen); delete en patchStatus tellen aanroepen.
const fake = {
  conv: {} as any, threads: [] as any[], totalPages: 1 as any, deleteStatus: 204, patchStatus: 204,
  deleteCalls: [] as string[], threadReads: 0, afterFirstRead: null as null | (() => void), afterPatch: null as null | (() => void),
  listResponse: {} as any,
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
    get: jest.fn(async () => fake.listResponse),
    delete: jest.fn(async (ep: string) => { fake.deleteCalls.push(ep); return fake.deleteStatus; }),
    patchStatus: jest.fn(async () => { fake.afterPatch?.(); return fake.patchStatus; }),
    post: (...a: unknown[]) => fake.post(...a),
    patch: (...a: unknown[]) => fake.patch(...a),
    put: (...a: unknown[]) => fake.put(...a),
  },
}));

import { ToolHandler } from '../tools/index.js';
import { helpScoutClient } from '../utils/helpscout-client.js';

const PLACEHOLDER = '(Uitgaande e-mail - zie concept hieronder)';
const scaffold = { id: 1, type: 'customer', state: 'published', body: PLACEHOLDER, source: { type: 'api', via: 'customer' } };
const draft = { id: 2, type: 'reply', state: 'draft', body: 'Oude concepttekst' };
const customerMail = { id: 1, type: 'customer', state: 'published', body: 'Hallo, ik wil mijn bedrijf verkopen', source: { type: 'email', via: 'customer' } };
const REASON = 'vervangen door nieuw concept met actuele datum';

let dir: string;
const logPath = () => join(dir, 'log.jsonl');

const handler = new ToolHandler();
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await handler.callTool({ method: 'tools/call', params: { name, arguments: args } } as any);
  const text = (r.content[0] as any).text;
  try { return JSON.parse(text); } catch { return { raw: text, isError: r.isError }; }
};
const del = (args: Record<string, unknown> = {}) => call('deleteDraft', { conversationId: '100', threadId: '2', reason: REASON, ...args });
const upd = (args: Record<string, unknown> = {}) => call('updateDraft', { conversationId: '100', threadId: '2', text: 'Nieuwe tekst', reason: REASON, ...args });
const logLines = () => (existsSync(logPath()) ? readFileSync(logPath(), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []);
const blockLog = () => {
  const blocker = join(dir, 'is-een-bestand');
  writeFileSync(blocker, '');
  process.env.HELPSCOUT_DELETE_LOG = join(blocker, 'log.jsonl'); // ENOTDIR
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dd-'));
  process.env.HELPSCOUT_DELETE_LOG = logPath();
  Object.assign(fake, {
    conv: { id: 100, subject: 'Onderwerp', tags: [] }, threads: [scaffold, draft], totalPages: 1,
    deleteStatus: 204, patchStatus: 204, deleteCalls: [], threadReads: 0, afterFirstRead: null, afterPatch: null, listResponse: {},
  });
  (helpScoutClient.delete as jest.Mock).mockClear();
  (helpScoutClient.getFresh as jest.Mock).mockClear();
  (helpScoutClient.patchStatus as jest.Mock).mockClear();
  fake.post.mockReset(); fake.patch.mockReset(); fake.put.mockReset();
});

// deleteDraft

test('verwijdert een conceptconversatie zonder tag of grootboek, logt volledige tekst plus reden vooraf', async () => {
  const r = await del();
  expect(r.deleted).toBe(true);
  expect(r.draftText).toBe('Oude concepttekst');
  expect(fake.deleteCalls).toEqual(['/conversations/100']);
  const [ahead, done] = logLines();
  expect(ahead.action).toBe('deleting');
  expect(ahead.callerReason).toBe(REASON);
  expect(ahead.drafts).toEqual([{ threadId: '2', text: 'Oude concepttekst', to: null, cc: null, bcc: null }]);
  expect(done.action).toBe('deleted_draft_conversation');
});

test.each([
  ['concept door Maarten bewerkt', { threads: [scaffold, { ...draft, body: 'Maarten herschreef dit', cc: ['x@example.nl'] }] }],
  ['tweede draft van Maarten', { threads: [scaffold, draft, { id: 5, type: 'reply', state: 'draft', body: 'van Maarten' }] }],
  ['conceptconversatie uit de UI (alleen drafts)', { threads: [draft] }],
  ['met systeemregel (lineitem)', { threads: [scaffold, { id: 7, type: 'lineitem', state: 'published', body: null }, draft] }],
])('verwijdert ook: %s', async (_n, patch) => {
  Object.assign(fake, patch);
  expect((await del()).deleted).toBe(true);
});

test('HTTP 200 telt ook als verwijderd', async () => {
  fake.deleteStatus = 200;
  expect((await del()).deleted).toBe(true);
});

test.each([
  ['geen draft (verstuurd)', { threads: [scaffold, { ...draft, state: 'published' }] }, /geen draft/],
  ['echte klantconversatie', { threads: [customerMail, draft] }, /echte conversation/],
  ['verstuurde reply naast de draft', { threads: [scaffold, { id: 3, type: 'reply', state: 'published', body: 'x' }, draft] }, /echte conversation/],
  ['notitie in de conversation', { threads: [scaffold, { id: 3, type: 'note', state: 'published', body: 'intern' }, draft] }, /echte conversation/],
  ['twee placeholders', { threads: [scaffold, { ...scaffold, id: 9 }, draft] }, /echte conversation/],
  ['klantmail met toevallig de placeholdertekst', { threads: [{ ...scaffold, source: { type: 'email', via: 'customer' } }, draft] }, /echte conversation/],
  ['placeholder zonder source', { threads: [{ ...scaffold, source: undefined }, draft] }, /echte conversation/],
  ['ingeplande draft', { threads: [scaffold, { ...draft, scheduled: { scheduledFor: '2026-10-02T08:00:00Z' } }] }, /ingepland/],
  ['andere draft ingepland', { threads: [scaffold, draft, { id: 5, type: 'reply', state: 'draft', body: 'x', scheduled: { scheduledFor: 'x' } }] }, /ingepland/],
  ['andere draft zonder body', { threads: [scaffold, draft, { id: 5, type: 'reply', state: 'draft' }] }, /andere draft/],
  ['meerdere pagina threads', { totalPages: 2 }, /paginering/],
  ['paginering ontbreekt', { totalPages: undefined }, /paginering/],
  ['thread bestaat niet', { threads: [scaffold] }, /niet gevonden/],
  ['draft zonder body', { threads: [scaffold, { id: 2, type: 'reply', state: 'draft', text: 'x' }] }, /body/],
  ['samengevoegde conversation (301 naar ander id)', { conv: { id: 999, tags: [] } }, /wijkt af/],
])('deleteDraft weigert: %s', async (_n, patch, re) => {
  Object.assign(fake, patch);
  const r = await del();
  expect(r.deleted).toBe(false);
  expect(r.reason).toMatch(re);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
  expect(logLines()[0].action).toBe('refused');
});

test('weigert als de conversation verandert tussen controle en DELETE', async () => {
  fake.afterFirstRead = () => { fake.threads = [scaffold, { ...draft, state: 'published' }]; };
  const r = await del();
  expect(r.deleted).toBe(false);
  expect(r.reason).toMatch(/veranderd/);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('DELETE met andere status dan 204/200 telt niet als verwijderd', async () => {
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
  blockLog();
  expect((await del()).deleted).not.toBe(true);
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

test('deleteDraft verstuurt nooit iets: geen post, patch of put', async () => {
  await del();
  expect(fake.post).not.toHaveBeenCalled();
  expect(fake.patch).not.toHaveBeenCalled();
  expect(fake.put).not.toHaveBeenCalled();
  expect(helpScoutClient.patchStatus).not.toHaveBeenCalled();
});

// updateDraft

test('vervangt de tekst van een draft-reply in een echte klantconversatie, oude tekst vooraf gelogd', async () => {
  fake.threads = [customerMail, draft];
  fake.afterPatch = () => { fake.threads = [customerMail, { ...draft, body: 'Nieuwe tekst' }]; };
  const r = await upd();
  expect(r.updated).toBe(true);
  expect(r.stillDraft).toBe(true);
  expect(r.oldText).toBe('Oude concepttekst');
  expect(helpScoutClient.patchStatus).toHaveBeenCalledWith('/conversations/100/threads/2', { op: 'replace', path: '/text', value: 'Nieuwe tekst' });
  const [ahead, done] = logLines();
  expect(ahead).toMatchObject({ action: 'updating', oldText: 'Oude concepttekst', newText: 'Nieuwe tekst', callerReason: REASON });
  expect(done).toMatchObject({ action: 'updated_draft', httpStatus: 204, stillDraft: true, textMatches: true });
});

test.each([
  ['verstuurd bericht', { threads: [customerMail, { ...draft, state: 'published' }] }, /geen draft/],
  ['klantbericht', { threads: [customerMail, draft] , }, null],
  ['thread bestaat niet', { threads: [customerMail] }, /niet gevonden/],
  ['samengevoegde conversation', { conv: { id: 999 } }, /wijkt af/],
  ['ingeplande draft', { threads: [customerMail, { ...draft, scheduled: { scheduledFor: 'x' } }] }, /ingepland/],
])('updateDraft grens: %s', async (_n, patch, re) => {
  Object.assign(fake, patch);
  const r = await upd(_n === 'klantbericht' ? { threadId: '1' } : {});
  expect(r.updated).toBe(false);
  expect(r.reason).toMatch(re ?? /geen draft/);
  expect(helpScoutClient.patchStatus).not.toHaveBeenCalled();
});

test('updateDraft weigert als de draft verandert of verstuurd wordt tussen controle en PATCH', async () => {
  fake.afterFirstRead = () => { fake.threads = [scaffold, { ...draft, body: 'Maarten typt nog' }]; };
  const r = await upd();
  expect(r.updated).toBe(false);
  expect(r.reason).toMatch(/veranderd/);
  expect(helpScoutClient.patchStatus).not.toHaveBeenCalled();
});

test('updateDraft: niets gewijzigd als het log niet geschreven kan worden', async () => {
  blockLog();
  expect((await upd()).updated).not.toBe(true);
  expect(helpScoutClient.patchStatus).not.toHaveBeenCalled();
});

test.each([
  ['thread is na PATCH verstuurd', () => { fake.threads = [customerMail, { ...draft, state: 'published', body: 'Nieuwe tekst' }]; }, /geen draft meer/],
  ['tekst wijkt af na herlezen', () => { fake.threads = [customerMail, { ...draft, body: '<p>iets anders</p>' }]; }, /wijkt af/],
])('updateDraft meldt geen succes als de postcontrole faalt: %s', async (_n, after, re) => {
  fake.threads = [customerMail, draft];
  fake.afterPatch = after;
  const r = await upd();
  expect(r.success).toBe(false);
  expect(r.verified).toBe(false);
  expect(r.warning).toMatch(re);
  expect(logLines().pop().action).toBe('updated_unverified');
});

test('updateDraft: andere status dan 204/200 telt niet als gelukt', async () => {
  fake.patchStatus = 400;
  const r = await upd();
  expect(r.updated).toBe(false);
  expect(logLines().pop().action).toBe('update_failed');
});

test('updateDraft weigert lege tekst of korte reden zonder API-aanroep', async () => {
  for (const a of [{ text: '' }, { reason: 'kort' }]) expect((await upd(a)).updated).not.toBe(true);
  expect(helpScoutClient.getFresh).not.toHaveBeenCalled();
});

test('updateDraft verstuurt nooit iets en verwijdert niets', async () => {
  await upd();
  expect(fake.post).not.toHaveBeenCalled();
  expect(fake.put).not.toHaveBeenCalled();
  expect(helpScoutClient.delete).not.toHaveBeenCalled();
});

// Paginering: een afgekapte lijst is nooit stil

test.each([
  ['getThreads', { conversationId: '100' }, 'threads'],
  ['searchConversations', { status: 'active' }, 'conversations'],
  ['searchInboxes', { query: '' }, 'mailboxes'],
])('%s meldt heeftMeer en gebruikt page of cursor', async (tool, args, key) => {
  fake.listResponse = { _embedded: { [key]: [] }, page: { number: 1, totalPages: 3 }, _links: { next: { href: 'https://api.helpscout.net/v2/x?page=2' } } };
  const r1 = await call(tool, args);
  expect(r1).toMatchObject({ heeftMeer: true, volgendePagina: 2, nextCursor: 'https://api.helpscout.net/v2/x?page=2' });
  const r3 = await call(tool, { ...args, cursor: 'https://api.helpscout.net/v2/x?page=3' });
  expect(r3).toMatchObject({ heeftMeer: false, volgendePagina: null });
  expect((helpScoutClient.get as jest.Mock).mock.calls.pop()[1]).toMatchObject({ page: 3 });
  await call(tool, { ...args, page: 2 });
  expect((helpScoutClient.get as jest.Mock).mock.calls.pop()[1]).toMatchObject({ page: 2 });
});

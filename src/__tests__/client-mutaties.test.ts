jest.mock('../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
import { HelpScoutClient } from '../utils/helpscout-client.js';

// delete en patchStatus mogen na een fout nooit automatisch opnieuw schrijven (de controles van de aanroeper zijn dan verlopen).
test.each(['delete', 'patchStatus'])('%s doet precies één poging, ook na een netwerkfout', async (method) => {
  const c = new HelpScoutClient() as any;
  const calls: string[] = [];
  const fail = async () => { calls.push(method); throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }); };
  c.client = { delete: fail, patch: fail };
  await expect(method === 'delete' ? c.delete('/conversations/1') : c.patchStatus('/conversations/1/threads/2', {})).rejects.toBeDefined();
  expect(calls).toHaveLength(1);
});

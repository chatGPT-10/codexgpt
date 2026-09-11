import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const { inspectReply, pollReply } = await tsImport('../src/c2c/browserExchange.ts', import.meta.url);
const binding = { tabId: '1', providerId: 'provider-one', chatUrl: 'https://chatgpt.com/c/11111111-1111-1111-1111-111111111111' };
const wire = '[CODEXGPT-C2C]\nPROTOCOL: 1\nSTATE: PLAN\nTASK_ID: c2c_test\nITERATION: 1\nPLAN_PATH: .ai-bridge/current-plan.md\nPLAN_SHA256: ' + 'a'.repeat(64) + '\nPLAN_BYTES: 12';
const baseline = { ...binding, lastAssistantId: 'old', userMessageId: 'sent' };
const snapshot = { ...binding, generating: false, error: false, messages: [{ id: 'sent', role: 'user', text: 'init' }, { id: 'new', role: 'assistant', text: wire }] };
const context = { taskId: 'c2c_test', expectedIteration: 1 };
test('accepts one completed assistant reply after exact sent user turn', () => {
  assert.equal(inspectReply(snapshot, baseline, context).message.state, 'PLAN');
});
test('ignores partial generation without parsing it', () => {
  assert.equal(inspectReply({ ...snapshot, generating: true }, baseline, context).status, 'waiting');
});
for (const [name, change] of Object.entries({
  provider: { providerId: 'reused' }, url: { chatUrl: 'https://evil.test/' }, error: { error: true },
  user: { messages: [{ id: 'other', role: 'user', text: 'init' }, snapshot.messages[1]] },
  stale: { messages: [snapshot.messages[0], { ...snapshot.messages[1], id: 'old' }] },
  quoted: { messages: [snapshot.messages[0], { ...snapshot.messages[1], text: '> ' + wire }] },
  duplicate: { messages: [...snapshot.messages, { ...snapshot.messages[1], id: 'another' }] },
  wrongTask: { messages: [snapshot.messages[0], { ...snapshot.messages[1], text: wire.replace('c2c_test', 'c2c_other') }] },
})) test(`rejects ${name}`, () => assert.throws(() => inspectReply({ ...snapshot, ...change }, baseline, context)));
test('poll budget exhaustion is pending and has no sending capability', async () => {
  let reads = 0; let sleeps = 0;
  const result = await pollReply({ read: async () => { reads++; return { ...snapshot, generating: true }; }, wait: async () => { sleeps++; } }, baseline, context, { attempts: 3, intervalMs: 1000 });
  assert.deepEqual(result, { status: 'pending' }); assert.equal(reads, 3); assert.equal(sleeps, 2);
});
test('poll stops on complete reply without another read', async () => {
  let reads = 0;
  const result = await pollReply({ read: async () => { reads++; return snapshot; }, wait: async () => {} }, baseline, context);
  assert.equal(result.status, 'complete'); assert.equal(reads, 1);
});

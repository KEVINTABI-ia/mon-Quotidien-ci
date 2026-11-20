import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-logement/worker.js';

test('health endpoint is available without touching other services', async () => {
  const response = await worker.fetch(new Request('https://logement.example/health'), { LOGEMENT_PHOTOS: {}, FIREBASE_API_KEY: 'test' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'mon-quotidien-ci-logement' });
});

test('rejects upload from an unapproved origin', async () => {
  const response = await worker.fetch(new Request('https://logement.example/upload', { method: 'POST', headers: { Origin: 'https://evil.example' } }), { LOGEMENT_PHOTOS: {}, FIREBASE_API_KEY: 'test' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'origin_not_allowed');
});

test('rejects image routes with malformed keys', async () => {
  const response = await worker.fetch(new Request('https://logement.example/images/other/uid/ad/file.jpg'), { LOGEMENT_PHOTOS: { get: async () => null }, FIREBASE_API_KEY: 'test' });
  assert.equal(response.status, 404);
});

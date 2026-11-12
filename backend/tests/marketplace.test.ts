import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { configuration } from '../src/config.js';
import { createApplication } from '../src/application.js';
import { localTestStorage } from './local-storage.js';

test('local marketplace: authentication, ownership, photos, chat, offers, meetups and blocks', { timeout: 120000 }, async () => {
  const baseConfig = configuration();
  const baseUrl = new URL(baseConfig.databaseUrl);
  assert.ok(['127.0.0.1','localhost'].includes(baseUrl.hostname), 'Integration tests require the isolated local PostgreSQL instance.');
  assert.equal(baseUrl.pathname, '/offerme_dev', 'Tests refuse to run against a non-development database.');
  const database = 'offerme_test_' + process.pid + '_' + Date.now();
  assert.match(database, /^offerme_test_[0-9_]+$/);
  const owner = new pg.Pool({ connectionString: baseConfig.databaseUrl });
  await owner.query('CREATE DATABASE "' + database + '"');
  baseUrl.pathname = '/' + database;
  const codes = new Map<string,string>();
  let runtime: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    runtime = await createApplication({ ...baseConfig, databaseUrl: baseUrl.toString(), adminPhones: ['+251900000103'] }, { migrate: true, quiet: true, storage: localTestStorage(baseConfig.uploadDir), onOtp: (phone, code) => { codes.set(phone, code); } });
    await runtime.app.listen(0, '127.0.0.1');
    const address = runtime.app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const api = 'http://127.0.0.1:' + address.port;
    const request = async (path: string, method = 'GET', body?: unknown, cookie = '') => {
      const headers: Record<string,string> = { origin: baseConfig.webOrigin };
      if (cookie) headers.cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      return fetch(api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    const login = async (phone: string, name: string) => {
      const sent = await request('/api/auth/phone-number/send-otp', 'POST', { phoneNumber: phone });
      assert.ok(sent.ok, await sent.text());
      const code = codes.get(phone); assert.ok(code, 'OTP sender was called');
      const verified = await request('/api/auth/phone-number/verify', 'POST', { phoneNumber: phone, code });
      assert.ok(verified.ok, await verified.clone().text());
      const cookie = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.ok(cookie.includes('session_token'));
      const profile = await request('/v1/me', 'PATCH', { name }, cookie);
      assert.ok(profile.ok, await profile.clone().text());
      return { cookie, ...(await profile.json()) as { id: string; name: string } };
    };
    assert.equal((await request('/v1/health')).status, 200);
    const catalog = await (await request('/v1/catalog')).json() as { categories: unknown[]; neighborhoods: string[] };
    assert.equal(catalog.categories.length, 15); assert.ok(catalog.neighborhoods.includes('Bole'));
    assert.equal((await request('/v1/me')).status, 401);
    assert.equal((await request('/v1/listings', 'POST', {})).status, 401);

    const seller = await login('+251900000101', 'Test Seller');
    const buyer = await login('+251900000102', 'Test Buyer');
    const outsider = await login('+251900000103', 'Test Outsider');
    const picture = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#d2e3d4' } }).png().toBuffer();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(picture)], { type: 'image/png' }), 'test.png');
    const upload = await fetch(api + '/v1/media', { method: 'POST', headers: { cookie: seller.cookie, origin: baseConfig.webOrigin }, body: form });
    assert.ok(upload.ok, await upload.clone().text());
    const photo = await upload.json() as { url: string };
    assert.match(photo.url, /^\/media\/[a-f0-9-]+\.webp$/);
    assert.equal((await fetch(api + photo.url)).headers.get('content-type'), 'image/webp');
    assert.equal((await fetch(api + '/media/' + randomUUID() + '.webp')).status, 404);
    // Legacy disk photos remain readable after the additive storage migration.
    await runtime.context.pool.query('UPDATE media SET storage=NULL WHERE path=$1', [photo.url]);
    assert.equal((await fetch(api + photo.url)).status, 200);
    // The API keeps owned /media URLs while redirecting cloud objects at read time.
    const storage = runtime.context.storage;
    const localUpload = storage.upload;
    const localDelivery = storage.deliveryUrl;
    storage.upload = async file => ({ provider: 'cloudinary', key: file.key, url: 'https://res.cloudinary.com/test-cloud/image/upload/photo.webp' });
    storage.deliveryUrl = async file => file.url || null;
    try {
      const cloudUpload = await fetch(api + '/v1/media', { method: 'POST', headers: { cookie: seller.cookie, origin: baseConfig.webOrigin }, body: form });
      assert.equal(cloudUpload.status, 201);
      const cloudPhoto = await cloudUpload.json() as { url: string };
      const stored = await runtime.context.pool.query('SELECT storage FROM media WHERE path=$1', [cloudPhoto.url]);
      assert.equal(stored.rows[0].storage.provider, 'cloudinary');
      const delivery = await fetch(api + cloudPhoto.url, { redirect: 'manual' });
      assert.equal(delivery.status, 302);
      assert.equal(delivery.headers.get('location'), stored.rows[0].storage.url);
      assert.equal(delivery.headers.get('cache-control'), 'no-store');
    } finally { storage.upload = localUpload; storage.deliveryUrl = localDelivery; }

    const listing = { title: 'Integration test phone', description: 'A real test of the listing creation endpoint.', defects: 'No known defects', priceMinor: 250000, categoryId: 'phones', condition: 'good', neighborhood: 'Bole', negotiable: true, images: [photo.url] };
    const posted = await request('/v1/listings', 'POST', listing, seller.cookie);
    assert.ok(posted.ok, await posted.clone().text());
    const item = await posted.json() as { id: string };
    const detail = await (await request('/v1/listings/' + item.id)).json() as Record<string,unknown>;
    assert.equal(detail.sellerName, 'Test Seller');
    assert.equal(detail.phoneNumber, undefined); assert.equal(detail.email, undefined);
    const found = await (await request('/v1/listings?q=Integration&category=phones&neighborhood=Bole')).json() as { items: unknown[]; total: number };
    assert.equal(found.total, 1);
    assert.equal((await request('/v1/listings/' + item.id, 'PATCH', listing, buyer.cookie)).status, 404);
    assert.equal((await request('/v1/listings', 'POST', { ...listing, neighborhood: 'Outside Addis' }, seller.cookie)).status, 400);
    assert.equal((await request('/v1/listings', 'POST', listing, buyer.cookie)).status, 400);
    await request('/v1/favorites/' + item.id, 'POST', undefined, buyer.cookie);
    await request('/v1/favorites/' + item.id, 'POST', undefined, buyer.cookie);
    assert.equal(((await (await request('/v1/favorites', 'GET', undefined, buyer.cookie)).json()) as { items: unknown[] }).items.length, 1);

    const conversationResponse = await request('/v1/conversations', 'POST', { listingId: item.id }, buyer.cookie);
    assert.ok(conversationResponse.ok, await conversationResponse.clone().text());
    const conversation = await conversationResponse.json() as { id: string };
    const thread = '/v1/conversations/' + conversation.id;
    assert.equal((await request(thread, 'GET', undefined, outsider.cookie)).status, 404);
    const message = { clientId: randomUUID(), body: 'Hello, can we meet to inspect this phone?' };
    const first = await (await request(thread + '/messages', 'POST', message, buyer.cookie)).json() as { id: string };
    const retry = await (await request(thread + '/messages', 'POST', message, buyer.cookie)).json() as { id: string };
    assert.ok(first.id); assert.equal(first.id, retry.id);
    assert.equal((await request(thread + '/messages', 'POST', { ...message, body: 'Changed body' }, buyer.cookie)).status, 400);
    const contents = await (await request(thread, 'GET', undefined, seller.cookie)).json() as { messages: unknown[] };
    assert.equal(contents.messages.length, 1);

    const offerResponse = await request(thread + '/offers', 'POST', { amountMinor: 240000 }, buyer.cookie);
    const offer = await offerResponse.json() as { id: string };
    assert.equal((await request(thread + '/offers/' + offer.id, 'PATCH', { status: 'accepted' }, buyer.cookie)).status, 400);
    assert.equal((await request(thread + '/offers/' + offer.id, 'PATCH', { status: 'accepted' }, seller.cookie)).status, 200);
    const meetupResponse = await request(thread + '/meetups', 'POST', { place: 'Public cafe in Bole, Addis Ababa', scheduledAt: new Date(Date.now() + 3600000).toISOString() }, buyer.cookie);
    const meetup = await meetupResponse.json() as { id: string };
    assert.equal((await request(thread + '/meetups/' + meetup.id, 'PATCH', { status: 'confirmed' }, seller.cookie)).status, 200);
    assert.equal((await request(thread + '/meetups/' + meetup.id, 'PATCH', { status: 'completed' }, buyer.cookie)).status, 400);
    assert.equal((await request('/v1/admin/reports', 'GET', undefined, buyer.cookie)).status, 403);
    assert.equal((await request('/v1/blocks/' + buyer.id, 'POST', undefined, seller.cookie)).status, 201);
    assert.equal((await request(thread + '/messages', 'POST', { clientId: randomUUID(), body: 'Should be blocked' }, buyer.cookie)).status, 403);
    assert.equal((await request(thread + '/meetups/' + meetup.id, 'PATCH', { status: 'cancelled' }, buyer.cookie)).status, 403);
    assert.equal((await request('/v1/listings/' + item.id + '/status', 'PATCH', { status: 'sold' }, seller.cookie)).status, 200);
    assert.equal((await request('/v1/listings/' + item.id + '/status', 'PATCH', { status: 'active' }, seller.cookie)).status, 400);
    const reportResponse = await request('/v1/reports', 'POST', { listingId: item.id, reason: 'Please review this test listing for a policy concern.' }, buyer.cookie);
    assert.equal(reportResponse.status, 201);
    const report = await reportResponse.json() as { id: string };
    assert.equal((await request('/v1/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }, buyer.cookie)).status, 403);
    const reports = await (await request('/v1/admin/reports', 'GET', undefined, outsider.cookie)).json() as { items: { id: string }[] };
    assert.ok(reports.items.some(r => r.id === report.id));
    assert.equal((await request('/v1/admin/reports/' + report.id, 'PATCH', { status: 'resolved' }, outsider.cookie)).status, 200);
    assert.equal((await request('/v1/admin/listings/' + item.id, 'PATCH', undefined, outsider.cookie)).status, 200);
    assert.equal((await request('/v1/listings/' + item.id)).status, 404);
    assert.equal((await request('/v1/listings/' + item.id + '/status', 'PATCH', { status: 'active' }, seller.cookie)).status, 400);
    const audit = await runtime.context.pool.query('SELECT action FROM audit_event WHERE actor_id=$1 ORDER BY action', [outsider.id]);
    assert.deepEqual(audit.rows.map(r => r.action), ['listing.removed', 'report.resolved']);
  } finally {
    if (runtime) await runtime.close();
    await owner.query('DROP DATABASE "' + database + '" WITH (FORCE)');
    await owner.end();
  }
});

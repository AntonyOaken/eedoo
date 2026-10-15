import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('service worker falls back offline only for navigation and leaves API and map requests untouched', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const offline = new Response('offline');
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {location: {origin: 'https://poputi.test'}, addEventListener: (name: string, handler: any) => handlers[name] = handler},
    URL, caches: {match: async () => offline}, fetch: async () => {throw new Error('offline');},
  });
  let result: Promise<Response> | undefined;
  handlers.fetch({request: {url: 'https://poputi.test/', method: 'GET', mode: 'navigate'}, respondWith: (value: Promise<Response>) => result = value});
  assert.equal(await result, offline);
  for (const [url,method] of [['https://poputi.test/api/routes','GET'],['https://tiles.example/1/2/3.png','GET'],['https://poputi.test/api/routes','POST']]) {
    handlers.fetch({request: {url,method,mode:'cors'},respondWith: () => assert.fail('must use network without interception')});
  }
});

test('install icons exist with declared PNG dimensions', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.display_override.includes('standalone'));
  for (const icon of manifest.icons) {
    const png = readFileSync(`public${icon.src}`);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

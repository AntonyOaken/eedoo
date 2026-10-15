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

test('offline upgrade deletes only EEDOO-owned obsolete caches', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  let claimed = false;
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {addEventListener: (name: string, handler: any) => handlers[name] = handler,
      clients: {claim: async () => {claimed = true;}}},
    caches: {keys: async () => ['poputi-offline-v1', 'eedoo-offline-v1', 'eedoo-offline-v3', 'unrelated-app-cache'],
      delete: async (key: string) => {deleted.push(key);}},
  });
  let completed: Promise<void> | undefined;
  handlers.activate({waitUntil: (value: Promise<void>) => completed = value});
  await completed;
  assert.deepEqual(deleted.sort(), ['eedoo-offline-v1', 'poputi-offline-v1']);
  assert.equal(claimed, true);
});

test('installed theme, launch photo and local font agree with the selected UI', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  const css = readFileSync('app/globals.css', 'utf8').toLowerCase();
  const component = readFileSync('components/app-experience.tsx', 'utf8');
  assert.equal(manifest.theme_color, '#315e7d');
  assert.match(css, /--primary:\s*#315e7d/);
  assert.match(css, /\.poi-hours-open\{color:#176847;background:#e1f2e8/);
  for (const match of component.matchAll(/(?:src|href)="(\/launch\/[^"]+)"/g)) {
    assert.ok(readFileSync('public' + match[1]).byteLength > 39042);
  }
  assert.ok(readFileSync('public/fonts/outfit-medium.ttf').byteLength > 10000);
});

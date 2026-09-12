import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolveApiOrigin } from '../config/api-origin.ts';

let passed = 0;
for (const [raw, environment, expected] of [
  [undefined, 'production', 'https://next-link-backend.vercel.app'],
  ['', 'production', 'https://next-link-backend.vercel.app'],
  ['  ', 'production', 'https://next-link-backend.vercel.app'],
  [undefined, 'development', 'http://127.0.0.1:8000'],
  [undefined, undefined, 'http://127.0.0.1:8000'],
  [' https://api.example.com/ ', 'production', 'https://api.example.com'],
  ['http://127.0.0.1:18999/', 'production', 'http://127.0.0.1:18999'],
  ['http://[::1]:8000', 'development', 'http://[::1]:8000'],
]) {
  assert.equal(resolveApiOrigin(raw, environment), expected);
  passed++;
}
for (const raw of ['undefined', '/api', '//api.example.com', 'javascript:alert(1)',
  'ftp://api.example.com', 'https://api.example.com/api/v1', 'https://api.example.com?key=secret',
  'https://api.example.com/#fragment', 'https://user:secret@api.example.com']) {
  assert.throws(() => resolveApiOrigin(raw, 'production'), error => {
    assert.match(error.message, /^API_ORIGIN must be/);
    assert.equal(error.message.includes('secret'), false);
    return true;
  });
  passed++;
}
// Exercise the actual Next config in fresh processes so import caching cannot
// hide changes between missing, blank and explicit environment values.
for (const [raw, expected] of [
  [undefined, 'https://next-link-backend.vercel.app'],
  ['', 'https://next-link-backend.vercel.app'],
  ['https://api.example.com/', 'https://api.example.com'],
]) {
  const env = { ...process.env, NODE_ENV: 'production' };
  if (raw === undefined) delete env.API_ORIGIN;
  else env.API_ORIGIN = raw;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
    'const {default:config}=await import("./next.config.ts"); console.log(JSON.stringify(await config.rewrites()))',
  ], { cwd: new URL('../', import.meta.url), env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [{ source: '/api/v1/:path*', destination: `${expected}/api/v1/:path*` }]);
  passed++;
}
console.log(`api origin: ok (${passed} checks)`);

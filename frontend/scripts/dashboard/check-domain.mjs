import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const output = mkdtempSync(join(tmpdir(), 'nextlink-dashboard-tests-'));
const tests = readdirSync('scripts/dashboard/tests').filter(file => file.endsWith('.test.ts'));
try {
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc',
    ...tests.map(file => join('scripts/dashboard/tests', file)), '--outDir', output,
    '--module', 'node16', '--moduleResolution', 'node16', '--types', 'node', '--target', 'ES2022',
    '--esModuleInterop', '--resolveJsonModule', '--strict', '--skipLibCheck',
  ], { stdio: 'inherit' });
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else process.exitCode = spawnSync(process.execPath, ['--test', ...tests.map(file => join(output, 'scripts/dashboard/tests', file.replace(/\.ts$/, '.js')))], { stdio: 'inherit' }).status ?? 1;
} finally { rmSync(output, { recursive: true, force: true }); }

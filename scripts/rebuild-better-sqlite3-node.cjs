const { spawnSync } = require('node:child_process');
const { dirname, join, resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const packageJsonPath = require.resolve('better-sqlite3/package.json', {
  paths: [join(repoRoot, 'packages/db')],
});
const packageDir = dirname(packageJsonPath);
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const result = spawnSync(corepack, ['pnpm', '--dir', packageDir, 'run', 'install'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');
const desktopDir = join(repoRoot, 'apps', 'desktop');
const databasePackageDir = join(repoRoot, 'packages', 'db');
const packageJsonPath = require.resolve('better-sqlite3/package.json', {
  paths: [databasePackageDir],
});
const packageDir = dirname(packageJsonPath);
const corepackScript = join(
  dirname(process.execPath),
  'node_modules',
  'corepack',
  'dist',
  'corepack.js',
);
const preservePackagedElectron = process.argv.includes('--preserve-packaged-electron');
const packagedBinaryPath = join(
  repoRoot,
  'apps',
  'desktop',
  'dist',
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node',
);
const workspaceBinaryPath = join(packageDir, 'build', 'Release', 'better_sqlite3.node');

let packagedElectronBinary;

if (preservePackagedElectron) {
  if (!existsSync(packagedBinaryPath)) {
    throw new Error(`Packaged better-sqlite3 binary is missing: ${packagedBinaryPath}`);
  }

  const electronVersion = require(
    require.resolve('electron/package.json', { paths: [desktopDir] }),
  ).version;
  const electronRebuildMain = require.resolve('@electron/rebuild', { paths: [desktopDir] });
  const electronRebuildCli = join(dirname(electronRebuildMain), 'cli.js');
  const electronResult = spawnSync(
    process.execPath,
    [
      electronRebuildCli,
      '--version',
      electronVersion,
      '--force',
      '--which-module',
      'better-sqlite3',
      '--module-dir',
      databasePackageDir,
    ],
    { stdio: 'inherit' },
  );

  if (electronResult.status !== 0) {
    process.exit(electronResult.status ?? 1);
  }

  packagedElectronBinary = readFileSync(workspaceBinaryPath);
}

const result = spawnSync(
  process.execPath,
  [corepackScript, 'pnpm', '--dir', packageDir, 'run', 'install'],
  {
    stdio: 'inherit',
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (packagedElectronBinary) {
  unlinkSync(packagedBinaryPath);
  writeFileSync(packagedBinaryPath, packagedElectronBinary);
  console.log('Preserved Electron better-sqlite3 while restoring the workspace Node ABI.');
}

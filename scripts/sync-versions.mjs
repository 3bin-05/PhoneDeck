import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targetVersion = process.argv[2];

if (!targetVersion) {
  console.error('Usage: node scripts/sync-versions.mjs <version> (e.g. 0.2.0 or 0.2.0-beta.1)');
  process.exit(1);
}

// Semver regex
const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const match = targetVersion.match(semverRegex);
if (!match) {
  console.error(`Invalid semver version: ${targetVersion}`);
  process.exit(1);
}

const major = parseInt(match[1], 10);
const minor = parseInt(match[2], 10);
const patch = parseInt(match[3], 10);
const pre = match[4] || null;

// Derived Android versionCode per plan.md: major*10000 + minor*100 + patch
const versionCode = major * 10000 + minor * 100 + patch;

console.log(`Syncing Phone Deck version to: ${targetVersion}`);
console.log(`Derived Android versionCode: ${versionCode}`);

// 1. Update package.json files
const packageJsonPaths = [
  'package.json',
  'apps/agent/package.json',
  'apps/display/package.json',
  'packages/deck-android/package.json',
  'packages/ui-kit/package.json',
  'packages/theme-engine/package.json',
  'packages/wallpaper/package.json',
  'packages/widgets/package.json',
];

for (const rel of packageJsonPaths) {
  const full = path.join(rootDir, rel);
  if (fs.existsSync(full)) {
    const content = JSON.parse(fs.readFileSync(full, 'utf8'));
    content.version = targetVersion;
    fs.writeFileSync(full, JSON.stringify(content, null, 2) + '\n');
    console.log(`  Updated ${rel} -> ${targetVersion}`);
  }
}

// 2. Update Cargo.toml files
const cargoTomlPaths = [
  'crates/protocol/Cargo.toml',
  'crates/deck-cli/Cargo.toml',
  'crates/deck-mock/Cargo.toml',
  'crates/deck-sim/Cargo.toml',
  'apps/agent/src-tauri/Cargo.toml',
  'apps/display/src-tauri/Cargo.toml',
];

for (const rel of cargoTomlPaths) {
  const full = path.join(rootDir, rel);
  if (fs.existsSync(full)) {
    let content = fs.readFileSync(full, 'utf8');
    // Replace package version
    content = content.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${targetVersion}"`);
    fs.writeFileSync(full, content);
    console.log(`  Updated ${rel} -> ${targetVersion}`);
  }
}

// 3. Update tauri.conf.json files
const tauriConfPaths = [
  'apps/agent/src-tauri/tauri.conf.json',
  'apps/display/src-tauri/tauri.conf.json',
];

for (const rel of tauriConfPaths) {
  const full = path.join(rootDir, rel);
  if (fs.existsSync(full)) {
    const content = JSON.parse(fs.readFileSync(full, 'utf8'));
    content.version = targetVersion;
    fs.writeFileSync(full, JSON.stringify(content, null, 2) + '\n');
    console.log(`  Updated ${rel} -> ${targetVersion}`);
  }
}

// 4. Update Android gradle if present
const gradleConfigPath = path.join(rootDir, 'apps/display/src-tauri/gen/android/app/build.gradle.kts');
if (fs.existsSync(gradleConfigPath)) {
  let content = fs.readFileSync(gradleConfigPath, 'utf8');
  content = content.replace(/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`);
  content = content.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${targetVersion}"`);
  fs.writeFileSync(gradleConfigPath, content);
  console.log(`  Updated ${gradleConfigPath} -> versionCode: ${versionCode}, versionName: ${targetVersion}`);
}

console.log('Version synchronization complete.');

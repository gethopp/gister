#!/usr/bin/env node
// Single source of truth for the app version: bumps package.json,
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml together so the git tag
// `v<version>` always matches the bundled version. The Homebrew cask URL
// (releases/download/v<version>/Gister_<version>_<arch>.dmg) only resolves when
// these agree, so keep them in lockstep.
//
// Uses targeted, formatting-preserving replacements (no JSON reformatting).
//
// Usage: pnpm run version <x.y.z>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: pnpm run version <x.y.z>  (e.g. pnpm run version 0.2.0)');
  process.exit(1);
}

// Replace the first top-level `"version": "..."` in a JSON file, preserving
// all other formatting.
function bumpJsonVersion(path) {
  const src = readFileSync(path, 'utf8');
  const re = /("version"\s*:\s*")\d+\.\d+\.\d+(")/;
  if (!re.test(src)) {
    console.error(`Could not find a "version" field in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, src.replace(re, `$1${version}$2`));
}

bumpJsonVersion(join(root, 'package.json'));
bumpJsonVersion(join(root, 'src-tauri', 'tauri.conf.json'));

// src-tauri/Cargo.toml — the version under [package] only.
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
let inPackage = false;
let replaced = false;
const cargo = readFileSync(cargoPath, 'utf8')
  .split('\n')
  .map((line) => {
    const section = line.match(/^\s*\[([^\]]+)\]/);
    if (section) {
      inPackage = section[1] === 'package';
      return line;
    }
    if (inPackage && !replaced && /^\s*version\s*=/.test(line)) {
      replaced = true;
      return line.replace(/=.*/, `= "${version}"`);
    }
    return line;
  })
  .join('\n');
if (!replaced) {
  console.error('Could not find [package] version in Cargo.toml');
  process.exit(1);
}
writeFileSync(cargoPath, cargo);

console.log(`Set version to ${version} in package.json, tauri.conf.json, Cargo.toml`);

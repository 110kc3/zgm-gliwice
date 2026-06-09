#!/usr/bin/env node
// Sync the Gliwice slice of przetargimiejskie's published data into this repo.
//
// przetargimiejskie (110kc3/przetargimiejskie) is now the canonical pipeline.
// It scrapes + OCRs the ZGM Gliwice auction PDFs and publishes per-city JSON
// under data/<city>/. This extension consumes only Gliwice, so we mirror
// data/gliwice/{properties,active,meta}.json into our own data/gliwice/ and
// keep serving it from this repo's raw.githubusercontent.com URL (the
// extension's background.js fetches 110kc3/zgm-gliwice/main/data/gliwice/).
//
// Run locally:   node scripts/sync-from-przetargimiejskie.mjs
// In CI:         see .github/workflows/refresh.yml
//
// Override the upstream with env vars when testing a fork/branch:
//   SOURCE_REPO=owner/repo SOURCE_BRANCH=main node scripts/sync-from-przetargimiejskie.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE_REPO = process.env.SOURCE_REPO || '110kc3/przetargimiejskie';
const SOURCE_BRANCH = process.env.SOURCE_BRANCH || 'main';
const CITY = 'gliwice';
const FILES = ['properties.json', 'active.json', 'meta.json'];

const base = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_BRANCH}/data/${CITY}`;
const outDir = join(process.cwd(), 'data', CITY);

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  // Validate it parses as JSON, but keep the original text so we write it
  // byte-for-byte (no key reordering / whitespace churn in the diff).
  const text = await res.text();
  JSON.parse(text);
  return text;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let changed = 0;
  for (const file of FILES) {
    const text = await fetchJson(`${base}/${file}`);
    const dest = join(outDir, file);
    await writeFile(dest, text);
    console.log(`synced ${CITY}/${file} (${text.length} bytes)`);
    changed++;
  }
  console.log(`Done — ${changed} file(s) written to data/${CITY}/.`);
}

main().catch((err) => {
  console.error('sync failed:', err.message);
  process.exit(1);
});

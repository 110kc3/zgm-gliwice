#!/usr/bin/env node

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

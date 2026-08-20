#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = new URL('.', import.meta.url);
const sourceDir = new URL('./source/', rootDir);
const entries = await readdir(sourceDir, { withFileTypes: true });
const builders = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    path: path.join(fileURLToPath(sourceDir), entry.name, 'build-entries.mjs'),
  }));

let ranAny = false;
for (const builder of builders.sort((a, b) => a.name.localeCompare(b.name))) {
  try {
    await import(`${pathToFileURL(builder.path).href}?t=${Date.now()}`);
    console.log(`rebuilt ${builder.name}`);
    ranAny = true;
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'MODULE_NOT_FOUND') continue;
    throw error;
  }
}

if (!ranAny) console.log('no build-entries.mjs scripts found under source/');

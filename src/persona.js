import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = join(__dirname, '..', 'personas', 'default.md');

let currentPersona = '';
let watcher = null;

export async function loadPersona() {
  try {
    currentPersona = await readFile(PERSONA_PATH, 'utf-8');
  } catch {
    currentPersona = '';
  }
  return currentPersona;
}

export function getPersona() {
  return currentPersona;
}

export function watchPersona(onChange) {
  if (watcher) watcher.close();
  watcher = watch(PERSONA_PATH, { persistent: false }, async (event) => {
    if (event === 'change') {
      await loadPersona();
      if (onChange) onChange(currentPersona);
    }
  });
}

await loadPersona();
watchPersona();

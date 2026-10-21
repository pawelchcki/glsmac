// This entrypoint accepts only the public one-case pilot. Full-context evidence
// and custom evidence paths belong to unit-menu-context.test.mjs directly.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

for (const [key, relative] of [
  ['UNIT_MENU_CONTEXT_CASES', '../behavior-tests/ui/cases/unit-menu-context-former-hold.json'],
  ['UNIT_MENU_CONTEXT_OBSERVATIONS', '../behavior-tests/ui/observations/smacx-gog-2.0-unit-menu-context-former-hold.json'],
]) {
  const required = fileURLToPath(new URL(relative, import.meta.url));
  if (process.env[key] && resolve(process.env[key]) !== required) throw new Error(`${key} conflicts with the single-case Former/Hold pilot`);
  process.env[key] = required;
}
const selected = 'unit-menu-former-slot-29-synthetic';
if (process.env.UNIT_MENU_CONTEXT_CASE && process.env.UNIT_MENU_CONTEXT_CASE !== selected) throw new Error('UNIT_MENU_CONTEXT_CASE conflicts with the single-case Former/Hold pilot');
process.env.UNIT_MENU_CONTEXT_CASE = selected;
await import('./unit-menu-context.test.mjs');

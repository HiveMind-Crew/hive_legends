import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderCombatTables, spliceGeneratedBlock } from '../scripts/combatTables';
import { CONTENT } from '../src/content';

/**
 * Keeps the generated tables in docs/COMBAT.md honest. Regenerate with
 * `npm run docs:combat` (which is this test with UPDATE_DOCS=1); otherwise it
 * fails whenever content data and the checked-in doc disagree, so a balance
 * change always lands with its table diff attached.
 */
const DOC_PATH = fileURLToPath(new URL('../docs/COMBAT.md', import.meta.url));

describe('docs/COMBAT.md', () => {
  it('has generated tables matching src/content', () => {
    const doc = readFileSync(DOC_PATH, 'utf8');
    const updated = spliceGeneratedBlock(doc, renderCombatTables(CONTENT));

    if (process.env.UPDATE_DOCS) {
      if (updated !== doc) writeFileSync(DOC_PATH, updated);
      return;
    }

    expect(doc, 'docs/COMBAT.md is stale — run `npm run docs:combat`').toBe(updated);
  });
});

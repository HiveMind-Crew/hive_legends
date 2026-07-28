import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BESTIARY_REGION,
  COMBAT_REGION,
  renderBestiaryTables,
  renderCombatTables,
  spliceGeneratedBlock
} from '../scripts/combatTables';
import { CONTENT } from '../src/content';

/**
 * Keeps the generated tables in docs/COMBAT.md honest. Regenerate with
 * `npm run docs:combat` (which is this test with UPDATE_DOCS=1); otherwise it
 * fails whenever content data and the checked-in doc disagree, so a balance
 * change always lands with its table diff attached.
 *
 * Both regions are spliced in one pass: the hero tables and the bestiary are
 * separate blocks so prose can sit between them, but a single regeneration
 * step keeps the whole document true, for enemies and the boss as much as for
 * heroes.
 */
const DOC_PATH = fileURLToPath(new URL('../docs/COMBAT.md', import.meta.url));

function regenerate(doc: string): string {
  const withHeroes = spliceGeneratedBlock(doc, renderCombatTables(CONTENT), COMBAT_REGION);
  return spliceGeneratedBlock(withHeroes, renderBestiaryTables(CONTENT), BESTIARY_REGION);
}

describe('docs/COMBAT.md', () => {
  it('has generated tables matching src/content', () => {
    const doc = readFileSync(DOC_PATH, 'utf8');
    const updated = regenerate(doc);

    if (process.env.UPDATE_DOCS) {
      if (updated !== doc) writeFileSync(DOC_PATH, updated);
      return;
    }

    expect(doc, 'docs/COMBAT.md is stale — run `npm run docs:combat`').toBe(updated);
  });
});

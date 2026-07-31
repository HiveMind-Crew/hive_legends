import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderEconomyTables, spliceEconomyBlock } from '../scripts/economyTables';
import { CONTENT, LEVELS } from '../src/content';
import { UPGRADES } from '../src/meta/save';

const DOC_PATH = fileURLToPath(new URL('../docs/ECONOMY.md', import.meta.url));

describe('docs/ECONOMY.md', () => {
  it('has generated income and sink tables matching content', () => {
    const doc = readFileSync(DOC_PATH, 'utf8');
    const updated = spliceEconomyBlock(doc, renderEconomyTables(LEVELS, CONTENT, UPGRADES));

    if (process.env.UPDATE_DOCS) {
      if (updated !== doc) writeFileSync(DOC_PATH, updated);
      return;
    }

    expect(doc, 'docs/ECONOMY.md is stale — run `npm run docs:economy`').toBe(updated);
  });
});

import type { UpgradeDef } from '../src/meta/save';
import type { ContentDb, LevelDef } from '../src/sim/types';

export const ECONOMY_REGION = 'economy-tables';

export function economyMarkers(): { begin: string; end: string } {
  return {
    begin: `<!-- BEGIN GENERATED: ${ECONOMY_REGION} -->`,
    end: `<!-- END GENERATED: ${ECONOMY_REGION} -->`
  };
}

/** Full price of every permanent rank in one upgrade track. */
export function upgradeTrackCost(def: UpgradeDef): number {
  let total = 0;
  for (let rank = 0; rank < def.maxLevel; rank++) {
    total += def.baseCost * Math.pow(def.costMultiplier, rank);
  }
  return total;
}

function expectedPropGold(level: LevelDef, content: ContentDb): number {
  return (level.props ?? []).reduce((sum, placement) => {
    const prop = content.props[placement.typeId];
    if (!prop || prop.dropKind !== 'gold') return sum;
    return sum + (prop.dropMin + prop.dropMax) / 2;
  }, 0);
}

/**
 * Static gold opportunity visible in authored data. Dynamic enemy drops are
 * excluded, so the report remains deterministic and deliberately conservative.
 */
export function staticLevelGold(level: LevelDef, content: ContentDb): number {
  const pickups = level.pickups
    .filter((pickup) => pickup.kind === 'gold')
    .reduce((sum, pickup) => sum + pickup.amount, 0);
  const generators = level.generators.reduce(
    (sum, placement) => sum + (content.generators[placement.typeId]?.goldDrop ?? 0),
    0
  );
  const boss = level.boss ? (content.bosses[level.boss.typeId]?.goldDrop ?? 0) : 0;
  return pickups + generators + boss + expectedPropGold(level, content);
}

function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n');
}

export function renderEconomyTables(
  levels: Record<string, LevelDef>,
  content: ContentDb,
  upgrades: Record<string, UpgradeDef>
): string {
  const orderedLevels = content.spokes.flatMap((spoke) => [...spoke.missions, spoke.boss]).map((id) => levels[id]!);
  const incomeRows = orderedLevels.map((level) => {
    const staticGold = staticLevelGold(level, content);
    const bounty = level.boss
      ? content.economy.firstClearBossBonus
      : content.economy.firstClearMissionBonus;
    return [level.name, n(staticGold), String(bounty), n(staticGold + bounty)];
  });
  const staticIncome = orderedLevels.reduce((sum, level) => sum + staticLevelGold(level, content), 0);
  const bountyIncome = orderedLevels.reduce(
    (sum, level) =>
      sum +
      (level.boss ? content.economy.firstClearBossBonus : content.economy.firstClearMissionBonus),
    0
  );

  const upgradeRows = Object.values(upgrades).map((def) => [
    def.name,
    `${def.maxLevel} × ${def.baseCost}g`,
    String(upgradeTrackCost(def))
  ]);
  const upgradesTotal = Object.values(upgrades).reduce((sum, def) => sum + upgradeTrackCost(def), 0);
  const weaponsTotal = Object.values(content.weapons).reduce((sum, weapon) => sum + weapon.cost, 0);
  const recruitsTotal = Object.values(content.heroes).reduce(
    (sum, hero) => sum + (hero.unlock?.goldCost ?? 0),
    0
  );
  const sinkTotal = upgradesTotal + weaponsTotal + recruitsTotal;
  const incomeTotal = staticIncome + bountyIncome;

  return [
    table(['Level', 'Static opportunity', 'First-clear bounty', 'Modeled first clear'], incomeRows),
    '',
    `Modeled Azure Reach income: **${n(incomeTotal)}g** (${n(staticIncome)}g static opportunity + ${bountyIncome}g bounties). Dynamic enemy drops are extra.`,
    '',
    table(['Upgrade track', 'Curve', 'Total'], upgradeRows),
    '',
    table(
      ['Permanent sink', 'Gold'],
      [
        ['Shared upgrades', String(upgradesTotal)],
        ['All hero weapon tiers', String(weaponsTotal)],
        ['All hero recruitment', String(recruitsTotal)],
        ['**Everything**', `**${sinkTotal}**`]
      ]
    ),
    '',
    `Full-roster sink / modeled first-clear income: **${(sinkTotal / incomeTotal).toFixed(2)}×**.`
  ].join('\n');
}

export function spliceEconomyBlock(doc: string, generated: string): string {
  const { begin, end } = economyMarkers();
  const start = doc.indexOf(begin);
  const finish = doc.indexOf(end);
  if (start < 0 || finish < 0 || finish < start) {
    throw new Error(`Missing generated economy markers: ${begin} / ${end}`);
  }
  return `${doc.slice(0, start + begin.length)}\n${generated}\n${doc.slice(finish)}`;
}

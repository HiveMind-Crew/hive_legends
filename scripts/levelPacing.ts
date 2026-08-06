import { BROOD_WARRENS, COBALT_COMBS, HOLLOW_THRONE, RESIN_GALLERIES } from '../src/content';
import { measureLevelPacing } from '../src/sim/levelMetrics';

const rows = [BROOD_WARRENS, RESIN_GALLERIES, COBALT_COMBS, HOLLOW_THRONE].map((level) => {
  const metrics = measureLevelPacing(level);
  return {
    level: level.name,
    dimensions: `${metrics.widthTiles}x${metrics.heightTiles}`,
    floorTiles: metrics.walkableFloorCount,
    routeTiles: metrics.criticalPathDistanceTiles,
    finalExitTiles: metrics.finalObjectiveToExitTiles,
    pinchWidth: metrics.minCriticalCorridorWidthTiles,
    objectiveOrder: metrics.objectiveOrder.join(' -> ')
  };
});

console.table(rows);

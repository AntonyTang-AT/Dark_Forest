// ============================================================
// 恒星生命周期 + 文明分裂 + 宇宙灾难
// ============================================================
import type { Civilization, StarSystem, SimEvent, CosmicDisaster } from './types';
import { CONFIG } from './config';
import { createCivilization } from './civilization';
import type { Universe } from './universe';

let disasterIdCounter = 0;

// ============================================================
// 恒星生命周期
// ============================================================
export function updateStarLifecycle(
  systems: StarSystem[], tick: number, civs: Civilization[],
): SimEvent[] {
  if (!CONFIG.starLifecycleEnabled) return [];
  const events: SimEvent[] = [];

  for (const sys of systems) {
    if (sys.destroyed) continue;
    sys.age += CONFIG.starAgingRate;

    // 恒星老化→红巨星
    if (sys.age > sys.maxAge * 0.85 && sys.stage === 'main_sequence') {
      sys.stage = 'red_giant';
      sys.starSize *= 1.5;
      sys.starColor = '#ff6633';
      events.push({
        tick, type: 'detection',
        detail: `🔴 ${sys.name} 膨胀为红巨星——周围行星面临毁灭`,
      });
    }

    // 红巨星膨胀吞噬行星
    if (sys.stage === 'red_giant') {
      sys.starSize += CONFIG.redGiantExpansionRate;
      for (const planet of sys.planets) {
        if (planet.semiMajorAxis < sys.starSize * 2 && planet.occupied) {
          const civ = civs.find(c => c.id === planet.occupantCivId && c.alive);
          if (civ && !civ.inBlackDomain) {
            civ.alive = false;
            civ.causeOfDeath = '红巨星吞噬';
            planet.occupied = false;
            planet.occupantCivId = null;
            events.push({
              tick, type: 'death',
              targetId: civ.id, targetName: civ.name,
              detail: `🔴 ${civ.name} 的母星被膨胀的红巨星 ${sys.name} 吞噬`,
            });
          }
        }
      }
    }

    // 超新星爆发
    if ((sys.starType === 'blue_giant' || sys.stage === 'red_giant') &&
        Math.random() < CONFIG.supernovaProbPerTick) {
      sys.stage = 'supernova';
      sys.destroyed = true;
      sys.destroyedAt = tick;
      sys.destroyCause = '超新星爆发';

      // 杀伤范围内所有文明
      for (const civ of civs) {
        if (!civ.alive || civ.inBlackDomain) continue;
        const dist = Math.sqrt((civ.x-sys.x)**2+(civ.y-sys.y)**2+(civ.z-sys.z)**2);
        if (dist < CONFIG.supernovaRadius) {
          civ.alive = false;
          civ.causeOfDeath = '超新星爆发';
          events.push({
            tick, type: 'death',
            targetId: civ.id, targetName: civ.name,
            detail: `💥 ${civ.name} 被 ${sys.name} 的超新星爆发摧毁`,
          });
        }
      }
      events.push({
        tick, type: 'detection',
        detail: `💥 ${sys.name} 发生超新星爆发——杀伤半径 ${CONFIG.supernovaRadius}`,
      });
    }
  }

  return events;
}

// ============================================================
// 文明分裂（内战）
// ============================================================
export function checkCivilWar(
  civ: Civilization, tick: number, universe: Universe,
): Civilization | null {
  if (!CONFIG.civilWarEnabled) return null;
  if (!civ.alive || civ.inBlackDomain || civ.warState) return null;
  if (civ.politics.stability > CONFIG.civilWarStabilityThreshold) return null;
  if (Math.random() > CONFIG.civilWarProbPerTick) return null;

  // 分裂：创建一个新文明
  const angle = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const d = CONFIG.splitDistance;
  const nx = civ.x + Math.sin(phi) * Math.cos(angle) * d;
  const ny = civ.y + Math.sin(phi) * Math.sin(angle) * d;
  const nz = civ.z + Math.cos(phi) * d;

  const newCiv = createCivilization(nx, ny, nz, tick, 'young', false, null, civ.techTree);
  // 保留大部分科技
  for (const key of Object.keys(newCiv.techTree) as (keyof typeof newCiv.techTree)[]) {
    newCiv.techTree[key] = civ.techTree[key] * CONFIG.splitTechRetention;
  }
  newCiv.population = Math.floor(civ.population * 0.4);
  civ.population = Math.floor(civ.population * 0.5);
  newCiv.politics.stability = 0.6;
  civ.politics.stability = 0.5;
  newCiv.name = `${civ.name}分离派`;

  // 互相高度猜疑
  civ.knownCivs.set(newCiv.id, {
    civId: newCiv.id, discoveredAt: tick,
    estimatedTech: 10, estimatedIntent: -0.8,
    suspicionIndex: 0.7, suspicionDepth: 3,
    lastObservedAt: tick, observationCount: 1,
    targetingProgress: 0.5, observationHistory: [],
  });
  newCiv.knownCivs.set(civ.id, {
    civId: civ.id, discoveredAt: tick,
    estimatedTech: 10, estimatedIntent: -0.8,
    suspicionIndex: 0.7, suspicionDepth: 3,
    lastObservedAt: tick, observationCount: 1,
    targetingProgress: 0.5, observationHistory: [],
  });

  return newCiv;
}

// ============================================================
// 宇宙灾难
// ============================================================
export function spawnRandomDisaster(universe: Universe, tick: number): CosmicDisaster | null {
  if (!CONFIG.disasterEnabled) return null;
  if (Math.random() > CONFIG.disasterProbPerTick) return null;

  const pos = universe.randomPosition(100);
  return {
    id: `ds_${(disasterIdCounter++).toString(36)}`,
    type: Math.random() < 0.7 ? 'gamma_ray_burst' : 'supernova_shockwave',
    x: pos.x, y: pos.y, z: pos.z,
    radius: 10,
    maxRadius: CONFIG.grbRadius,
    expansionRate: CONFIG.grbRadius / CONFIG.grbDuration,
    startedAt: tick,
    duration: CONFIG.grbDuration,
    active: true,
  };
}

export function updateDisasters(
  disasters: CosmicDisaster[], civs: Civilization[], tick: number,
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const ds of disasters) {
    if (!ds.active) continue;
    ds.radius += ds.expansionRate;
    if (ds.radius >= ds.maxRadius) { ds.active = false; continue; }

    // 杀伤范围内文明
    for (const civ of civs) {
      if (!civ.alive || civ.inBlackDomain) continue;
      const dist = Math.sqrt((civ.x-ds.x)**2+(civ.y-ds.y)**2+(civ.z-ds.z)**2);
      if (dist < ds.radius) {
        civ.alive = false;
        civ.causeOfDeath = ds.type === 'gamma_ray_burst' ? '伽马射线暴' : '超新星冲击波';
        events.push({
          tick, type: 'death',
          targetId: civ.id, targetName: civ.name,
          detail: `☢️ ${civ.name} 被宇宙灾难摧毁`,
        });
      }
    }
  }

  return events;
}

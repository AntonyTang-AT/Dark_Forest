// ============================================================
// 黑暗森林模拟器 — 文明实体 v4 (3D + 战争)
// ============================================================

import type {
  Civilization, Strategy, Knowledge, CivRenderData,
  PendingAction, CivGeneration, WarState, Colony,
} from './types';
import { CIV_NAME_PREFIXES, CIV_NAME_SUFFIXES, ANCIENT_NAME_PREFIXES } from './types';
import { CONFIG } from './config';
import {
  createTechTree, getOverallTech, advanceTech,
  checkBreakthrough, applyBreakthrough, salvageTech,
} from './tech_tree';
import { createPolitics, updatePolitics } from './politics';
import type { Universe } from './universe';
import type { StarSystem } from './types';
import { getPlanetPosition as getPP } from './galaxy';

// 全局星系引用（由 main.ts 设置）
let _starSystems: StarSystem[] = [];
export function setStarSystemsForColonization(sys: StarSystem[]): void { _starSystems = sys; }

const GEN_COLORS: Record<CivGeneration, string> = {
  ancient: '#ff6b35', elder: '#ffd700', mature: '#58a6ff', young: '#3fb950',
};
const FUGITIVE_COLOR = '#a0a0b8';
const WAR_COLOR_OVERLAY = '#ff4444';

let idCounter = 0;
function genId(): string { return `civ_${(idCounter++).toString(36).padStart(4, '0')}`; }
export function resetIdCounter(): void { idCounter = 0; }

function genName(generation: CivGeneration, isFugitive: boolean): string {
  if (isFugitive) {
    const p = ['流浪', '幸存', '逃亡', '残存', '遗民'][Math.floor(Math.random() * 5)];
    const s = ['舰队', '船团', '遗族', '火种', '余烬'][Math.floor(Math.random() * 5)];
    return `${p}${s}`;
  }
  if (generation === 'ancient') {
    const p = ANCIENT_NAME_PREFIXES[Math.floor(Math.random() * ANCIENT_NAME_PREFIXES.length)];
    const s = CIV_NAME_SUFFIXES[Math.floor(Math.random() * CIV_NAME_SUFFIXES.length)];
    return `${p}·${s}`;
  }
  return `${CIV_NAME_PREFIXES[Math.floor(Math.random() * CIV_NAME_PREFIXES.length)]}${CIV_NAME_SUFFIXES[Math.floor(Math.random() * CIV_NAME_SUFFIXES.length)]}`;
}

function randomNormal(m: number, s: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function genStrategy(generation: CivGeneration, isFugitive: boolean): Strategy {
  if (isFugitive) {
    return {
      aggression: clamp(randomNormal(0.2, 0.15), 0.05, 0.5),
      caution: clamp(randomNormal(0.8, 0.1), 0.5, 0.98),
      cooperation: clamp(randomNormal(0.1, 0.08), 0.02, 0.3),
      expansionism: clamp(randomNormal(0.2, 0.15), 0.05, 0.4),
    };
  }
  switch (generation) {
    case 'ancient':
      return {
        aggression: clamp(randomNormal(0.25, 0.2), 0.05, 0.7),
        caution: clamp(randomNormal(0.7, 0.15), 0.3, 0.95),
        cooperation: clamp(randomNormal(0.15, 0.1), 0.02, 0.5),
        expansionism: clamp(randomNormal(0.2, 0.15), 0.05, 0.6),
      };
    case 'elder':
      return {
        aggression: clamp(randomNormal(0.35, 0.25), 0.05, 0.85),
        caution: clamp(randomNormal(0.6, 0.2), 0.2, 0.95),
        cooperation: clamp(randomNormal(0.2, 0.15), 0.02, 0.6),
        expansionism: clamp(randomNormal(0.35, 0.25), 0.05, 0.8),
      };
    default:
      return {
        aggression: clamp(randomNormal(0.4, 0.25), 0.05, 0.95),
        caution: clamp(randomNormal(0.55, 0.25), 0.05, 0.95),
        cooperation: clamp(randomNormal(0.3, 0.2), 0.02, 0.8),
        expansionism: clamp(randomNormal(0.45, 0.25), 0.05, 0.95),
      };
  }
}

function getTechBonus(g: CivGeneration): number {
  switch (g) {
    case 'ancient': return CONFIG.ancientTechBonus;
    case 'elder': return CONFIG.elderTechBonus;
    case 'mature': return CONFIG.matureTechBonus;
    case 'young': return CONFIG.youngTechBonus;
  }
}

// ============================================================
// 创建文明
// ============================================================
export function createCivilization(
  x: number, y: number, z: number, tick: number,
  generation: CivGeneration,
  isFugitive: boolean = false,
  fugitiveOriginId: string | null = null,
  parentTechTree?: import('./types').TechTree,
): Civilization {
  const strategy = genStrategy(generation, isFugitive);
  const techTree = parentTechTree ?? createTechTree(generation);
  if (isFugitive && parentTechTree) {
    for (const key of Object.keys(techTree) as (keyof typeof techTree)[]) {
      techTree[key] = Math.max(1, parentTechTree[key] * CONFIG.fugitiveTechRetention);
    }
    techTree.stealth += CONFIG.fugitiveStealthBonus;
    strategy.caution = Math.min(0.98, strategy.caution + CONFIG.fugitiveCautionBonus);
  }

  const politics = createPolitics();
  const ctrlR = CONFIG.controlRadiusBase + CONFIG.initialPopulation * CONFIG.controlRadiusPopFactor +
    techTree.propulsion * CONFIG.controlRadiusTechFactor;
  const detR = CONFIG.detectionRangeBase + techTree.detection * CONFIG.detectionRangeTechFactor;

  return {
    id: genId(),
    name: genName(generation, isFugitive),
    generation,
    x, y, z,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    vz: (Math.random() - 0.5) * 0.15,
    radius: 10 + Math.random() * 6,
    controlRadius: ctrlR,
    detectionRadius: detR,
    population: isFugitive ? Math.floor(CONFIG.initialPopulation * CONFIG.fugitivePopRetention)
      : CONFIG.initialPopulation + Math.random() * 40,
    resources: isFugitive ? CONFIG.initialResources * CONFIG.fugitiveResourceRetention
      : CONFIG.initialResources + Math.random() * 80,
    signalStrength: 0,
    stealthActive: isFugitive ? true : strategy.caution > 0.45,
    inBlackDomain: false,
    enteredBlackDomainAt: -1,
    isFugitive,
    fugitiveOriginId,
    fugitiveCount: 0,
    activeSpellTargetId: null,
    allianceId: null,
    probeCount: 0,
    colonies: [{
      id: `col_${genId()}`, systemId: '', planetId: '',
      population: isFugitive ? Math.floor(CONFIG.initialPopulation * CONFIG.fugitivePopRetention) : CONFIG.initialPopulation + Math.random() * 40,
      resources: isFugitive ? CONFIG.initialResources * CONFIG.fugitiveResourceRetention : CONFIG.initialResources + Math.random() * 80,
      isCapital: true, foundedAt: tick,
    }],
    homeStarX: x, homeStarY: y, homeStarZ: z,
    warState: null,
    strategy,
    politics,
    techTree,
    knownCivs: new Map(),
    pendingAction: null,
    alive: true,
    causeOfDeath: null,
    birthTick: tick,
    color: isFugitive ? FUGITIVE_COLOR : GEN_COLORS[generation],
    breakthroughCooldown: 0,
    strikeCooldown: 0,
  };
}

// ============================================================
// 逃亡者
// ============================================================
export function tryCreateFugitive(
  deadCiv: Civilization, tick: number, universe: Universe,
): Civilization | null {
  if (!CONFIG.fugitiveEnabled) return null;
  if (deadCiv.fugitiveCount >= CONFIG.fugitiveMaxPerCiv) return null;
  if (deadCiv.inBlackDomain) return null;
  if (Math.random() > CONFIG.fugitiveBaseProb) return null;

  const angle = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const dist = CONFIG.fugitiveDistance * (0.7 + Math.random() * 0.6);
  let nx = deadCiv.x + Math.sin(phi) * Math.cos(angle) * dist;
  let ny = deadCiv.y + Math.sin(phi) * Math.sin(angle) * dist;
  let nz = deadCiv.z + Math.cos(phi) * dist;
  const half = universe.size / 2;
  nx = clamp(nx, -half + 50, half - 50);
  ny = clamp(ny, -half + 50, half - 50);
  nz = clamp(nz, -half + 50, half - 50);

  deadCiv.fugitiveCount++;
  return createCivilization(nx, ny, nz, tick, 'young', true, deadCiv.id, deadCiv.techTree);
}

// ============================================================
// 每 Tick 更新
// ============================================================
export interface CivUpdateResult {
  resourcePressure: number;
  hasDetectedThreat: boolean;
  wasStruck: boolean;
}

export function updateCivilization(
  civ: Civilization, tick: number, resourceIncome: number,
  hasDetectedThreat: boolean, wasStruck: boolean,
  universe: Universe,
): CivUpdateResult {
  if (!civ.alive) return { resourcePressure: 0, hasDetectedThreat: false, wasStruck: false };

  // ---- 黑域 ----
  if (civ.inBlackDomain) {
    civ.population += civ.population * CONFIG.blackDomainPopGrowthPenalty;
    civ.population = Math.max(1, civ.population);
    for (const key of Object.keys(civ.techTree) as (keyof typeof civ.techTree)[]) {
      civ.techTree[key] += CONFIG.techGrowthBase * CONFIG.blackDomainTechGrowthPenalty * (0.5 + Math.random() * 0.5);
    }
    civ.signalStrength = 0.001;
    civ.vx = 0; civ.vy = 0; civ.vz = 0;
    civ.radius = Math.max(civ.radius, civ.controlRadius * 0.5); // 不再增长
    if (civ.population <= 0) { civ.alive = false; civ.causeOfDeath = '黑域中消亡'; }
    return { resourcePressure: 0, hasDetectedThreat: false, wasStruck: false };
  }

  // ---- 战争消耗 ----
  let warDrain = 0;
  if (civ.warState && civ.warState.status === 'active') {
    warDrain = CONFIG.warResourceDrainPerTick;
    civ.warState.myExhaustion += CONFIG.warExhaustionRate;
    civ.warState.myExhaustion = Math.min(1, civ.warState.myExhaustion);
  }

  // ---- 殖民地汇总 ----
  civ.population = civ.colonies.reduce((s, c) => s + c.population, 0);
  civ.resources = civ.colonies.reduce((s, c) => s + c.resources, 0);

  // ---- 资源管理 ----
  const totalPop = civ.population;
  const resourcePressure = 1 - Math.min(1, civ.resources / (totalPop * 2 + 1));
  civ.resources += resourceIncome;
  civ.resources -= totalPop * CONFIG.resourceConsumePerPop;
  civ.resources -= warDrain;

  if (civ.resources < 0) {
    const starve = Math.ceil(-civ.resources / 2);
    civ.population = Math.max(1, civ.population - starve);
    civ.resources = Math.max(0, civ.resources + starve * 2);
  }
  if (civ.resources > civ.population * 1.5 && civ.population < CONFIG.popOvercrowdThreshold) {
    const gr = CONFIG.popGrowthBase * Math.max(0, 1 - resourcePressure * CONFIG.popGrowthResourceFactor);
    civ.population += Math.floor(civ.population * gr);
  }

  // ---- 科技 ----
  civ.techTree = advanceTech(civ.techTree, resourcePressure);
  if (civ.breakthroughCooldown > 0) civ.breakthroughCooldown--;
  if (civ.strikeCooldown > 0) civ.strikeCooldown--;
  const bt = checkBreakthrough(civ.techTree, resourcePressure,
    hasDetectedThreat || civ.knownCivs.size > 0, civ.breakthroughCooldown);
  if (bt) { bt.tick = tick; civ.techTree = applyBreakthrough(civ.techTree, bt); civ.breakthroughCooldown = CONFIG.techBreakthroughCooldown; }

  // ---- 政治 ----
  civ.politics = updatePolitics(civ.politics, hasDetectedThreat, wasStruck);
  if (civ.politics.stability < CONFIG.stabilityCollapseThreshold && Math.random() < 0.015) {
    civ.alive = false; civ.causeOfDeath = '内部崩溃'; return { resourcePressure, hasDetectedThreat, wasStruck };
  }

  // ---- 扩张（战争期间扩张减缓） ----
  const popP = civ.population / Math.max(1, CONFIG.popOvercrowdThreshold * 0.6);
  let expRate = CONFIG.expansionSpeedBase + civ.techTree.propulsion * CONFIG.expansionPropulsionFactor;
  expRate *= 0.5 + resourcePressure * 1.5;
  if (popP > 0.8) expRate *= 1 + (popP - 0.8) * 3;
  if (civ.stealthActive) expRate *= 0.3;
  if (civ.isFugitive) expRate *= 0.5;
  if (civ.warState?.status === 'active') expRate *= 0.4;
  expRate *= 0.5 + civ.strategy.expansionism * 1.5;
  civ.radius += expRate * 0.5;

  // 控制范围：基于殖民地数量，非线性增长（sqrt衰减）
  const colonySpread = civ.colonies.length > 1
    ? Math.sqrt(civ.colonies.length) * 60
    : 0;
  civ.controlRadius = CONFIG.controlRadiusBase + colonySpread +
    civ.techTree.propulsion * CONFIG.controlRadiusTechFactor * 0.3;
  civ.detectionRadius = CONFIG.detectionRangeBase + civ.techTree.detection * CONFIG.detectionRangeTechFactor;

  // ---- 迁徙（3D） ----
  migrate3D(civ, universe, hasDetectedThreat);

  // ---- 殖民扩张 ----
  if (civ.colonies.length < 10 && civ.resources > 500 && civ.population > 200 && Math.random() < 0.005) {
    tryColonize(civ, tick, universe);
  }

  // ---- 信号 ----
  civ.signalStrength = calcSignal(civ);

  // ---- 猜疑衰减 ----
  for (const [, k] of civ.knownCivs) {
    if (tick - k.lastObservedAt > 150) {
      k.suspicionIndex = Math.max(0.03, k.suspicionIndex - CONFIG.suspicionDecayRate);
    }
  }

  return { resourcePressure, hasDetectedThreat, wasStruck };
}

// ---- 殖民 ----
function tryColonize(civ: Civilization, tick: number, universe: Universe): void {
  let bestDist = Infinity;
  let bestSys: StarSystem | null = null;
  let bestPlanet: import('./types').Planet | null = null;

  for (const sys of _starSystems) {
    if (sys.destroyed || sys.inBlackDomain) continue;
    const dist = Math.sqrt((civ.x-sys.x)**2 + (civ.y-sys.y)**2 + (civ.z-sys.z)**2);
    if (dist > civ.detectionRadius * 0.8) continue;
    for (const pl of sys.planets) {
      if (pl.occupied || pl.habitability < 0.4) continue;
      if (dist < bestDist) { bestDist = dist; bestSys = sys; bestPlanet = pl; }
    }
  }

  if (bestSys && bestPlanet && bestDist < Infinity) {
    bestPlanet.occupied = true;
    bestPlanet.occupantCivId = civ.id;
    const col: Colony = {
      id: `col_${genId()}`,
      systemId: bestSys.id, planetId: bestPlanet.id,
      population: Math.floor(civ.population * 0.15),
      resources: 100,
      isCapital: false, foundedAt: tick,
    };
    civ.colonies.push(col);
    civ.resources -= 200;
  }
}

// ---- 3D 迁徙 ----
function migrate3D(civ: Civilization, universe: Universe, hasDetectedThreat: boolean): void {
  if (civ.inBlackDomain || civ.pendingAction?.isDarkForestStrike) return;
  if (civ.warState?.status === 'active') return; // 战争中不迁徙

  const genSpd = CONFIG.migrationSpeedByGeneration[civ.generation] ?? 1.0;
  const base = CONFIG.migrationSpeedBase * genSpd;

  // 资源吸引力
  let ax = 0, ay = 0, az = 0;
  const samples = 12;
  for (let i = 0; i < samples; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / samples);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const d = civ.detectionRadius * 0.4;
    const sx = civ.x + Math.sin(phi) * Math.cos(theta) * d;
    const sy = civ.y + Math.sin(phi) * Math.sin(theta) * d;
    const sz = civ.z + Math.cos(phi) * d;
    const res = universe.getResourceAt(sx, sy, sz);
    ax += Math.sin(phi) * Math.cos(theta) * res;
    ay += Math.sin(phi) * Math.sin(theta) * res;
    az += Math.cos(phi) * res;
  }
  const am = Math.sqrt(ax * ax + ay * ay + az * az);
  if (am > 0) { ax = (ax / am) * CONFIG.migrationResourceAttraction; ay = (ay / am) * CONFIG.migrationResourceAttraction; az = (az / am) * CONFIG.migrationResourceAttraction; }

  // 威胁排斥
  let rx = 0, ry = 0, rz = 0;
  for (const [, k] of civ.knownCivs) {
    if (k.suspicionIndex < 0.4) continue;
    // 大致远离方向
    rx += (Math.random() - 0.5) * k.suspicionIndex;
    ry += (Math.random() - 0.5) * k.suspicionIndex;
    rz += (Math.random() - 0.5) * k.suspicionIndex;
  }
  const rm = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rm > 0) { rx = (rx / rm) * CONFIG.migrationThreatRepulsion; ry = (ry / rm) * CONFIG.migrationThreatRepulsion; rz = (rz / rm) * CONFIG.migrationThreatRepulsion; }

  // 随机游走
  const rphi = Math.acos(2 * Math.random() - 1);
  const rtheta = Math.random() * Math.PI * 2;
  const rndX = Math.sin(rphi) * Math.cos(rtheta) * CONFIG.migrationRandomFactor;
  const rndY = Math.sin(rphi) * Math.sin(rtheta) * CONFIG.migrationRandomFactor;
  const rndZ = Math.cos(rphi) * CONFIG.migrationRandomFactor;

  let mx = ax + rx + rndX, my = ay + ry + rndY, mz = az + rz + rndZ;
  const mag = Math.sqrt(mx * mx + my * my + mz * mz);
  if (mag > base) { const s = base / mag; mx *= s; my *= s; mz *= s; }

  civ.vx = civ.vx * 0.8 + mx * 0.2;
  civ.vy = civ.vy * 0.8 + my * 0.2;
  civ.vz = civ.vz * 0.8 + mz * 0.2;

  civ.x += civ.vx; civ.y += civ.vy; civ.z += civ.vz;
  const half = universe.size / 2;
  civ.x = clamp(civ.x, -half + 20, half - 20);
  civ.y = clamp(civ.y, -half + 20, half - 20);
  civ.z = clamp(civ.z, -half + 20, half - 20);
}

// ---- 信号 ----
function calcSignal(civ: Civilization): number {
  if (civ.inBlackDomain) return 0.001;
  let s = CONFIG.signalBaseStrength;
  s += civ.population * CONFIG.signalPopFactor;
  s += getOverallTech(civ.techTree) * CONFIG.signalTechFactor;
  s += (Math.abs(civ.vx) + Math.abs(civ.vy) + Math.abs(civ.vz)) * CONFIG.signalExpansionFactor;
  s *= Math.max(0.1, 1 - civ.techTree.stealth * 0.04);
  if (civ.stealthActive) s *= CONFIG.signalHidingReduction;
  if (civ.warState?.status === 'active') s *= CONFIG.warSignalBurst;
  if (civ.pendingAction?.type === 'PHOTOID_STRIKE') s *= CONFIG.signalPhotoidBurst;
  if (civ.pendingAction?.type === 'DUAL_VECTOR_FOIL') s *= CONFIG.signalDualVectorBurst;
  if (civ.pendingAction?.type === 'SPELL' || civ.activeSpellTargetId) s *= CONFIG.spellSignalBurst;
  if (civ.pendingAction?.type === 'BROADCAST') s *= CONFIG.signalBroadcastBurst;
  return s;
}

// ---- 能力检查 ----
export function canPhotoidStrike(civ: Civilization): boolean {
  return civ.techTree.weapons >= CONFIG.photoidWeaponThreshold &&
    civ.resources >= CONFIG.photoidResourceCost * 0.5 && civ.strikeCooldown <= 0 && !civ.inBlackDomain;
}
export function canDualVectorStrike(civ: Civilization): boolean {
  return civ.techTree.weapons >= CONFIG.dualVectorWeaponThreshold &&
    civ.resources >= CONFIG.dualVectorResourceCost * 0.5 && civ.strikeCooldown <= 0 && !civ.inBlackDomain;
}
export function canBlackDomain(civ: Civilization): boolean {
  return civ.techTree.cognition >= CONFIG.blackDomainCognitionThreshold &&
    civ.techTree.stealth >= CONFIG.blackDomainStealthThreshold &&
    civ.resources >= CONFIG.blackDomainResourceCost && !civ.inBlackDomain;
}
export function canAnyStrike(civ: Civilization): boolean {
  return canPhotoidStrike(civ) || canDualVectorStrike(civ);
}
export function canCastSpell(civ: Civilization): boolean {
  return CONFIG.spellEnabled && civ.resources >= CONFIG.spellResourceCost &&
    !civ.inBlackDomain && !civ.activeSpellTargetId;
}

export function enterBlackDomain(civ: Civilization, tick: number): void {
  civ.inBlackDomain = true; civ.enteredBlackDomainAt = tick;
  civ.resources -= CONFIG.blackDomainResourceCost;
  civ.stealthActive = false; civ.pendingAction = null;
  civ.activeSpellTargetId = null; civ.warState = null;
  civ.vx = 0; civ.vy = 0; civ.vz = 0;
}

export function checkNaturalDeath(civ: Civilization): boolean {
  if (!civ.alive) return false;
  if (civ.population <= 0) { civ.alive = false; civ.causeOfDeath = civ.inBlackDomain ? '黑域中消亡' : '资源枯竭'; return true; }
  return false;
}

export function absorbDefeatedCiv(winner: Civilization, loser: Civilization): void {
  winner.techTree = salvageTech(winner.techTree, loser.techTree);
  winner.resources += loser.resources * 0.2;
}

// ---- 战争辅助 ----
export function createWarState(enemyId: string, tick: number): WarState {
  return {
    enemyId, startedAt: tick, lastResolutionAt: tick,
    myExhaustion: 0, enemyExhaustion: 0,
    totalMyLosses: 0, totalEnemyLosses: 0,
    status: 'active',
  };
}

// ---- 渲染数据 ----
export function toRenderData(civ: Civilization, isBreakthrough: boolean, tick?: number): CivRenderData {
  // 计算殖民地 3D 位置
  const colPositions: Array<{ x: number; y: number; z: number; isCapital: boolean }> = [];
  for (const col of civ.colonies) {
    const sys = _starSystems.find(s => s.id === col.systemId);
    const planet = sys?.planets.find(p => p.id === col.planetId);
    if (sys && planet) {
      const pos = getPP(sys, planet, tick ?? 0);
      colPositions.push({ x: pos.x, y: pos.y, z: pos.z, isCapital: col.isCapital });
    } else if (col.isCapital) {
      colPositions.push({ x: civ.x, y: civ.y, z: civ.z, isCapital: true });
    }
  }

  return {
    id: civ.id, x: civ.x, y: civ.y, z: civ.z,
    radius: civ.radius, controlRadius: civ.controlRadius,
    detectionRadius: civ.detectionRadius,
    color: civ.inBlackDomain ? '#3a3a4a' : civ.warState?.status === 'active' ? WAR_COLOR_OVERLAY : civ.color,
    signalStrength: civ.signalStrength, alive: civ.alive,
    isHiding: civ.stealthActive, isBreakthrough,
    inBlackDomain: civ.inBlackDomain,
    isFugitive: civ.isFugitive,
    atWar: civ.warState?.status === 'active',
    hasActiveSpell: civ.activeSpellTargetId !== null,
    canPhotoidStrike: canPhotoidStrike(civ),
    canDualVectorStrike: canDualVectorStrike(civ),
    generation: civ.generation,
    strategy: civ.strategy,
    techLevel: getOverallTech(civ.techTree),
    weaponLevel: civ.techTree.weapons,
    population: civ.population,
    causeOfDeath: civ.causeOfDeath,
    name: civ.inBlackDomain ? `${civ.name} [黑域]`
      : civ.isFugitive ? `${civ.name} [逃亡]`
      : civ.warState?.status === 'active' ? `${civ.name} [交战中]`
      : civ.name,
    homeStarX: civ.homeStarX, homeStarY: civ.homeStarY, homeStarZ: civ.homeStarZ,
    homeSystemId: null,
    colonyPositions: colPositions,
  };
}

export function getStrategyLabel(strategy: Strategy): string {
  const m = Math.max(strategy.aggression, strategy.caution, strategy.cooperation, strategy.expansionism);
  if (strategy.aggression === m) return '攻击型';
  if (strategy.caution === m) return '谨慎型';
  if (strategy.cooperation === m) return '合作型';
  if (strategy.expansionism === m) return '扩张型';
  return '均衡型';
}

// ============================================================
// 黑暗森林模拟器 — 主入口 v7 (追踪 + 总结 + 键盘)
// ============================================================

import { CONFIG, SCENARIOS } from './config';
import type { CivRenderData, RenderLink, DualVectorRenderData, DualVectorZone, CivGeneration, StarSystem, Planet } from './types';
import { EventBus } from './event_bus';
import { Universe } from './universe';
import {
  createCivilization, updateCivilization, checkNaturalDeath,
  toRenderData, resetIdCounter, tryCreateFugitive,
  getStrategyLabel, setStarSystemsForColonization,
} from './civilization';
import { getOverallTech } from './tech_tree';
import { runDecisionPhase } from './decision';
import { Renderer } from './renderer';
import { ChartManager } from './charts';
import { UIManager, positionTooltip } from './ui';
import {
  generateStarSystems, updateStarSystems, findHabitablePlanet,
  getPlanetPosition, resetGalaxyCounters,
} from './galaxy';
import { createProbe, updateProbes } from './probes';
import { tryFormAlliance, updateAlliances, applyTechDiffusion } from './alliances';
import { updateStarLifecycle, checkCivilWar, spawnRandomDisaster, updateDisasters } from './events_ext';
import type { Civilization, Alliance, Probe, CosmicDisaster } from './types';

// ---- 全局 ----
const eventBus = new EventBus(500);
let universe: Universe;
let civilizations: Civilization[] = [];
let starSystems: StarSystem[] = [];
let dualVectorZones: DualVectorZone[] = [];
let probes: Probe[] = [];
let alliances: Alliance[] = [];
let disasters: CosmicDisaster[] = [];
let tick = 0;
let renderer: Renderer;
let chartManager: ChartManager;
let uiManager: UIManager;
let paused = false; let speed = 1;
let tickAcc = 0; let lastFrame = 0; let afId = 0;

let totalDeaths = 0; let totalPhotoid = 0; let totalDual = 0;
let totalBlackDomains = 0; let totalDetections = 0; let totalWars = 0;
let deathsByCause: Record<string, number> = {
  '光粒打击': 0, '二向箔打击': 0, '二向箔波及': 0, '二向箔扩散': 0,
  '星际战争败亡': 0, '资源枯竭': 0, '内部崩溃': 0, '黑域中消亡': 0,
  '超新星爆发': 0, '红巨星吞噬': 0, '伽马射线暴': 0, '超新星冲击波': 0,
};

let pendingCivCount = CONFIG.defaultCivCount;
let pendingResourceAbundance = CONFIG.resourceAbundance;
let pendingDetectionEfficiency = 0.4;
let pendingSuspicionEnabled = true;

let renderLinks: RenderLink[] = [];
let breakthroughCivs: Set<string> = new Set();

// 追踪状态
let trackedCivId: string | null = null;
let trackedHistory: Array<{ tick: number; pop: number; res: number; tech: number; weapons: number }> = [];
let trackChart: any = null;

interface CivBlueprint { systemId: string; planetId: string; birthTick: number; generation: CivGeneration; }
let pendingBirths: CivBlueprint[] = [];

// ============================================================
// 初始化
// ============================================================
function init(): void {
  tick = 0; totalDeaths = 0; totalPhotoid = 0; totalDual = 0;
  totalBlackDomains = 0; totalDetections = 0; totalWars = 0;
  deathsByCause = {
    '光粒打击': 0, '二向箔打击': 0, '二向箔波及': 0, '二向箔扩散': 0,
    '星际战争败亡': 0, '资源枯竭': 0, '内部崩溃': 0, '黑域中消亡': 0,
  '超新星爆发': 0, '红巨星吞噬': 0, '伽马射线暴': 0, '超新星冲击波': 0,
  };
  tickAcc = 0; lastFrame = performance.now();
  renderLinks = []; breakthroughCivs = new Set();
  dualVectorZones = []; probes = []; alliances = []; disasters = [];
  resetIdCounter(); resetGalaxyCounters();

  universe = new Universe(CONFIG.universeSize, pendingResourceAbundance);

  // 生成星系
  starSystems = generateStarSystems(CONFIG.universeSize);
  console.log(`✨ 生成了 ${starSystems.length} 个星系`);

  // 统计宜居行星
  const habitablePlanets = starSystems.flatMap(s =>
    s.planets.filter(p => p.habitability > 0.3).map(p => ({ sys: s, planet: p })));
  console.log(`   宜居行星: ${habitablePlanets.length}`);

  // 预分配文明到宜居行星
  civilizations = []; pendingBirths = [];

  for (let i = 0; i < pendingCivCount; i++) {
    const roll = Math.random();
    let gen: CivGeneration; let off: number;
    if (roll < CONFIG.ancientCivRatio) { gen = 'ancient'; off = Math.random()*CONFIG.civBirthSpan*0.08; }
    else if (roll < CONFIG.ancientCivRatio+CONFIG.elderCivRatio) { gen = 'elder'; off = CONFIG.civBirthSpan*(0.08+Math.random()*0.17); }
    else if (roll < CONFIG.ancientCivRatio+CONFIG.elderCivRatio+CONFIG.matureCivRatio) { gen = 'mature'; off = CONFIG.civBirthSpan*(0.25+Math.random()*0.35); }
    else { gen = 'young'; off = CONFIG.civBirthSpan*(0.6+Math.random()*0.4); }

    // 寻找宜居行星
    const result = findHabitablePlanet(starSystems);
    if (result) {
      result.planet.occupied = true;
      pendingBirths.push({
        systemId: result.system.id, planetId: result.planet.id,
        birthTick: Math.floor(off), generation: gen,
      });
    }
  }

  // 按诞生时间排序
  pendingBirths.sort((a, b) => a.birthTick - b.birthTick);
  spawnDue(0);
  rebuildCivPlanetMap();

  // 通知渲染器和殖民系统星系数据
  renderer.setStarSystems(starSystems);
  setStarSystemsForColonization(starSystems);

  console.log(`🌌 总文明: ${pendingBirths.length + civilizations.length}`);
  console.log(`   古老: ${pendingBirths.filter(b=>b.generation==='ancient').length + civilizations.filter(c=>c.generation==='ancient').length}`);
}

function spawnDue(ct: number): void {
  while (pendingBirths.length > 0 && pendingBirths[0].birthTick <= ct) {
    const b = pendingBirths.shift()!;
    const sys = starSystems.find(s => s.id === b.systemId);
    const planet = sys?.planets.find(p => p.id === b.planetId);
    if (!sys || !planet) continue;

    const pos = getPlanetPosition(sys, planet, ct);
    const civ = createCivilization(pos.x, pos.y, pos.z, ct, b.generation);
    planet.occupied = true;
    planet.occupantCivId = civ.id;
    civToPlanet.set(civ.id, { sys, planet });
    civilizations.push(civ);
  }
}

// ---- 文明→行星映射（避免每 tick 全量扫描） ----
let civToPlanet: Map<string, { sys: StarSystem; planet: Planet }> = new Map();

function rebuildCivPlanetMap(): void {
  civToPlanet.clear();
  for (const sys of starSystems) {
    for (const planet of sys.planets) {
      if (planet.occupantCivId) {
        civToPlanet.set(planet.occupantCivId, { sys, planet });
      }
    }
  }
}

function syncCivToPlanet(): void {
  for (const civ of civilizations) {
    if (!civ.alive || civ.inBlackDomain) continue; // 黑域文明不移动、不扩张
    const entry = civToPlanet.get(civ.id);
    if (!entry || entry.sys.destroyed) continue;
    const pos = getPlanetPosition(entry.sys, entry.planet, tick);
    // 平滑跟随
    const lerp = 0.04;
    civ.x += (pos.x - civ.x) * lerp;
    civ.y += (pos.y - civ.y) * lerp;
    civ.z += (pos.z - civ.z) * lerp;
  }
}

// ---- 打击影响星系 ----
function markStruckSystem(civId: string, cause: string): void {
  for (const sys of starSystems) {
    for (const planet of sys.planets) {
      if (planet.occupantCivId === civId) {
        sys.destroyed = true;
        sys.destroyedAt = tick;
        sys.destroyCause = cause;
        return;
      }
    }
  }
}

// ---- 黑域影响星系 ----
function markBlackDomainSystem(civId: string): void {
  for (const sys of starSystems) {
    for (const planet of sys.planets) {
      if (planet.occupantCivId === civId) {
        sys.inBlackDomain = true;
        return;
      }
    }
  }
}

// ---- 二向箔影响星系 ----
function markDualVectorSystems(x: number, y: number, z: number, radius: number): void {
  for (const sys of starSystems) {
    if (sys.destroyed || sys.inDualVectorZone) continue;
    const dist = Math.sqrt((sys.x-x)**2 + (sys.y-y)**2 + (sys.z-z)**2);
    if (dist < radius) {
      sys.inDualVectorZone = true;
      sys.destroyed = true;
      sys.destroyedAt = tick;
      sys.destroyCause = '二向箔二维化';
    }
  }
}

// ============================================================
// 模拟
// ============================================================
// 事件处理辅助
function processEvent(ev: import('./types').SimEvent): void {
  if (ev.type === 'death') {
    totalDeaths++;
    if (ev.detail?.includes('光粒打击')) deathsByCause['光粒打击']++;
    else if (ev.detail?.includes('二向箔打击')) deathsByCause['二向箔打击']++;
    else if (ev.detail?.includes('波及')) deathsByCause['二向箔波及']++;
    else if (ev.detail?.includes('扩散')) deathsByCause['二向箔扩散']++;
    else if (ev.detail?.includes('星际战争败亡') || ev.detail?.includes('战争中灭亡') || ev.detail?.includes('战争中击败') || ev.detail?.includes('战争中征服')) deathsByCause['星际战争败亡']++;
    else if (ev.detail?.includes('资源枯竭')) deathsByCause['资源枯竭']++;
    else if (ev.detail?.includes('内部崩溃')) deathsByCause['内部崩溃']++;
    else if (ev.detail?.includes('黑域中消亡')) deathsByCause['黑域中消亡']++;
    else if (ev.detail?.includes('超新星')) deathsByCause['超新星爆发'] = (deathsByCause['超新星爆发'] || 0) + 1;
    else if (ev.detail?.includes('红巨星')) deathsByCause['红巨星吞噬'] = (deathsByCause['红巨星吞噬'] || 0) + 1;
    else if (ev.detail?.includes('伽马射线')) deathsByCause['伽马射线暴'] = (deathsByCause['伽马射线暴'] || 0) + 1;
    else if (ev.detail?.includes('冲击波')) deathsByCause['超新星冲击波'] = (deathsByCause['超新星冲击波'] || 0) + 1;
  }
  if (ev.type === 'photoid_strike') totalPhotoid++;
  if (ev.type === 'dual_vector_foil') totalDual++;
  if (ev.type === 'black_domain') totalBlackDomains++;
  if (ev.type === 'detection' || ev.type === 'tracking') totalDetections++;
  if (ev.type === 'war_declared') totalWars++;
}

function simTick(): void {
  spawnDue(tick);

  // 更新星系（漂移 + 行星轨道）
  updateStarSystems(starSystems, CONFIG.universeSize, tick);

  // 同步文明到行星
  syncCivToPlanet();

  const alive = civilizations.filter(c => c.alive);

  // 1. 增长
  for (const civ of alive) {
    updateCivilization(civ, tick, universe.extractResources(civ), false, false, universe);
  }

  // 1.5 探测器更新
  const probeEvents = updateProbes(probes, civilizations, universe, tick);
  for (const ev of probeEvents) { uiManager.addEvent(ev); eventBus.emit(ev); }

  // 1.6 恒星生命周期
  const starEvents = updateStarLifecycle(starSystems, tick, civilizations);
  for (const ev of starEvents) { processEvent(ev); }

  // 1.7 宇宙灾难
  const newDisaster = spawnRandomDisaster(universe, tick);
  if (newDisaster) disasters.push(newDisaster);
  const disasterEvents = updateDisasters(disasters, civilizations, tick);
  for (const ev of disasterEvents) { processEvent(ev); }

  // 1.8 科技传播
  applyTechDiffusion(civilizations, universe);

  // 1.9 文明分裂
  const newCivs: Civilization[] = [];
  for (const civ of civilizations.filter(c => c.alive)) {
    const split = checkCivilWar(civ, tick, universe);
    if (split) {
      newCivs.push(split);
      uiManager.addEvent({
        tick, type: 'detection',
        sourceId: civ.id, sourceName: civ.name,
        targetId: split.id, targetName: split.name,
        detail: `⚡ ${civ.name} 发生内战——${split.name} 分离独立`,
      });
    }
  }
  civilizations.push(...newCivs);

  // 2. 决策
  const { events, newDualVectorZones } = runDecisionPhase(
    civilizations, universe, tick, pendingSuspicionEnabled, pendingDetectionEfficiency, dualVectorZones);
  dualVectorZones.push(...newDualVectorZones);

  // 3. 事件处理
  for (const ev of events) {
    if (ev.type === 'photoid_strike') {
      totalPhotoid++;
      // 光粒打击只摧毁目标文明的一个殖民地
      const targetCiv = civilizations.find(c => c.id === ev.targetId && c.alive);
      if (targetCiv && targetCiv.colonies.length > 1) {
        // 移除一个非首都殖民地
        const nonCap = targetCiv.colonies.filter(c => !c.isCapital);
        if (nonCap.length > 0) {
          const removed = nonCap[Math.floor(Math.random() * nonCap.length)];
          targetCiv.colonies = targetCiv.colonies.filter(c => c.id !== removed.id);
          ev.detail = `☀️ 光粒打击摧毁了 ${targetCiv.name} 的一个殖民地（${targetCiv.colonies.length}个剩余）`;
          // 释放行星
          for (const sys of starSystems) {
            const pl = sys.planets.find(p => p.id === removed.planetId);
            if (pl) { pl.occupied = false; pl.occupantCivId = null; }
          }
        } else {
          // 只剩首都 → 灭亡
          targetCiv.alive = false;
          targetCiv.causeOfDeath = '光粒打击';
        }
      } else if (targetCiv) {
        targetCiv.alive = false;
        targetCiv.causeOfDeath = '光粒打击';
      }
      if (ev.targetId) markStruckSystem(ev.targetId, '光粒打击');
    }
    if (ev.type === 'dual_vector_foil') {
      totalDual++;
      if (ev.targetId) markStruckSystem(ev.targetId, '二向箔打击');
      // 标记二向箔影响区域内的星系
      const zone = newDualVectorZones.find(z => z.createdBy === ev.sourceId);
      if (zone) markDualVectorSystems(zone.x, zone.y, zone.z, zone.radius);
    }
    if (ev.type === 'black_domain') {
      totalBlackDomains++;
      if (ev.sourceId) markBlackDomainSystem(ev.sourceId);
    }
    if (ev.type === 'detection' || ev.type === 'tracking') totalDetections++;
    if (ev.type === 'war_declared') totalWars++;

    if (ev.type === 'death') {
      totalDeaths++;
      if (ev.detail?.includes('光粒打击')) deathsByCause['光粒打击']++;
      else if (ev.detail?.includes('二向箔打击')) deathsByCause['二向箔打击']++;
      else if (ev.detail?.includes('二向箔波及')) deathsByCause['二向箔波及']++;
      else if (ev.detail?.includes('被扩散')) deathsByCause['二向箔扩散']++;
      else if (ev.detail?.includes('星际战争败亡') || ev.detail?.includes('战争中灭亡') || ev.detail?.includes('战争中击败') || ev.detail?.includes('战争中征服')) deathsByCause['星际战争败亡']++;
      else if (ev.detail?.includes('资源枯竭')) deathsByCause['资源枯竭']++;
      else if (ev.detail?.includes('内部崩溃')) deathsByCause['内部崩溃']++;
      else if (ev.detail?.includes('黑域中消亡')) deathsByCause['黑域中消亡']++;

      const deadCiv = civilizations.find(c => c.id === ev.targetId);
      if (deadCiv && (ev.detail?.includes('光粒') || ev.detail?.includes('二向箔') || ev.detail?.includes('星际战争'))) {
        const fug = tryCreateFugitive(deadCiv, tick, universe);
        if (fug) {
          civilizations.push(fug);
          uiManager.addEvent({ tick, type: 'fugitive', sourceId: fug.id, sourceName: fug.name,
            targetId: deadCiv.id, targetName: deadCiv.name,
            detail: `🚀 ${deadCiv.name} 的幸存者——"${fug.name}"` });
        }
      }
    }

    // 时间线记录关键事件
    if (ev.type === 'photoid_strike') addTimelineEvent(tick, ev.detail || '', '#f85149');
    if (ev.type === 'dual_vector_foil') addTimelineEvent(tick, ev.detail || '', '#ff00ff');
    if (ev.type === 'black_domain') addTimelineEvent(tick, ev.detail || '', '#484f80');
    if (ev.type === 'war_declared') addTimelineEvent(tick, ev.detail || '', '#ff6b35');
    if (ev.detail?.includes('联盟')) addTimelineEvent(tick, ev.detail || '', '#3fb950');
    if (ev.detail?.includes('背刺')) addTimelineEvent(tick, ev.detail || '', '#f85149');
    if (ev.detail?.includes('超新星')) addTimelineEvent(tick, ev.detail || '', '#ffd700');
    if (ev.detail?.includes('红巨星')) addTimelineEvent(tick, ev.detail || '', '#ff6633');
    if (ev.detail?.includes('内战')) addTimelineEvent(tick, ev.detail || '', '#bc8cff');
    if (ev.detail?.includes('探测器')) addTimelineEvent(tick, ev.detail || '', '#58a6ff');
    if (ev.detail?.includes('逃亡')) addTimelineEvent(tick, ev.detail || '', '#a0a0b8');

    // 闪光
    if (ev.type === 'photoid_strike') {
      const a = civilizations.find(c => c.id === ev.sourceId);
      if (a) renderer.addFlash(a.x, a.y, a.z, '#ff6b35');
    }
    if (ev.type === 'dual_vector_foil') {
      const a = civilizations.find(c => c.id === ev.sourceId);
      if (a) renderer.addFlash(a.x, a.y, a.z, '#ff00ff');
    }
    if (ev.type === 'war_declared') {
      const a = civilizations.find(c => c.id === ev.sourceId);
      if (a) renderer.addFlash(a.x, a.y, a.z, '#ff2222');
    }
    uiManager.addEvent(ev);
    eventBus.emit(ev);
  }

  // 3.5 联盟建立 + 探测器发射
  for (const civ of alive) {
    // 发射探测器
    if (CONFIG.probeEnabled && civ.resources > CONFIG.probeLaunchCost * 2 &&
        civ.probeCount < CONFIG.probeMaxPerCiv && Math.random() < 0.01) {
      civ.resources -= CONFIG.probeLaunchCost;
      civ.probeCount++;
      probes.push(createProbe(civ));
    }
    // 尝试建立联盟
    for (const [, knowledge] of civ.knownCivs) {
      const other = alive.find(c => c.id === knowledge.civId);
      if (other) {
        const ev = tryFormAlliance(civ, other, tick, alliances);
        if (ev) { uiManager.addEvent(ev); eventBus.emit(ev); }
      }
    }
  }
  const allianceEvents = updateAlliances(alliances, civilizations, tick);
  for (const ev of allianceEvents) { uiManager.addEvent(ev); eventBus.emit(ev); }

  // 4. 自然死亡
  for (const civ of alive) {
    if (checkNaturalDeath(civ)) {
      totalDeaths++;
      if (civ.inBlackDomain) deathsByCause['黑域中消亡']++;
      else deathsByCause['资源枯竭']++;
      uiManager.addEvent({ tick, type: 'death', targetId: civ.id, targetName: civ.name,
        detail: civ.inBlackDomain ? `${civ.name} 在黑域中消亡` : `${civ.name} 资源枯竭` });
    }
  }

  // 5. 连线
  renderLinks = [];
  for (const civ of civilizations.filter(c => c.alive)) {
    for (const [, k] of civ.knownCivs) {
      const t = civilizations.find(c => c.id === k.civId && c.alive);
      if (!t) continue;
      const elapsed = tick - k.lastObservedAt;
      const alpha = Math.max(0.06, 0.55 - elapsed * 0.004);
      let lt: RenderLink['type'] = 'tracking';
      if (civ.pendingAction?.isDarkForestStrike && civ.pendingAction?.targetId === t.id) {
        lt = civ.pendingAction.type === 'DUAL_VECTOR_FOIL' ? 'dual_vector' : 'photoid';
      } else if (civ.activeSpellTargetId === t.id) { lt = 'spell'; }
      else if (civ.warState?.enemyId === t.id) { lt = 'war'; }
      renderLinks.push({ fromX: civ.x, fromY: civ.y, fromZ: civ.z,
        toX: t.x, toY: t.y, toZ: t.z, type: lt, alpha, progress: k.targetingProgress });
    }
  }

  // 6. 统计
  const aliveNow = civilizations.filter(c => c.alive);
  const avgT = aliveNow.length > 0
    ? aliveNow.reduce((s,c) => s+getOverallTech(c.techTree),0)/aliveNow.length : 0;

  uiManager.updateStats(tick, aliveNow.length, totalDeaths,
    totalPhotoid+totalDual, totalDetections, avgT,
    totalPhotoid, totalDual, totalBlackDomains,
    civilizations.filter(c => c.alive && c.inBlackDomain).length);

  // 更新饼图
  chartManager.update(tick, aliveNow.length, totalDeaths, deathsByCause);

  tick++;
}

// ============================================================
// 渲染循环 — 与模拟解耦，始终以 60fps 流畅运行
// ============================================================
function loop(now: number): void {
  afId = requestAnimationFrame(loop);
  const rawDt = (now - lastFrame) / 1000;
  lastFrame = now;
  // 限制最大帧间隔（防止切标签页后爆炸）
  const dt = Math.min(rawDt, 0.1);

  // 模拟以固定速率运行，每帧最多 3 tick
  if (!paused) {
    tickAcc += dt * speed * CONFIG.ticksPerSecond;
    let n = 0;
    const maxTicks = 3;
    while (tickAcc >= 1 && n < maxTicks) {
      tickAcc--;
      simTick();
      n++;
    }
    // 如果积压太多，丢弃（用户切标签页回来不会爆炸）
    if (tickAcc > maxTicks * 2) tickAcc = 0;
  }

  // 渲染始终以当前帧率运行
  const alive = civilizations.filter(c => c.alive);
  const rd: CivRenderData[] = alive.map(c => {
    const d = toRenderData(c, breakthroughCivs.has(c.id), tick);
    const entry = civToPlanet.get(c.id);
    if (entry) d.homeSystemId = entry.sys.id;
    return d;
  });
  const dvRd: DualVectorRenderData[] = dualVectorZones.map(z =>
    ({ id: z.id, x: z.x, y: z.y, z: z.z, radius: z.radius,
       alpha: Math.max(0.05, 1 / (1 + z.radius * 0.003)) }));

  // 传递 dt 用于相机平滑
  const { hovered } = renderer.render(rd, renderLinks, dvRd, universe, tick, dt);
  if (hovered) uiManager.updateTooltip(hovered);
  else uiManager.hideTooltip();

  // 更新追踪面板
  updateTrackingPanel();
}

// ============================================================
// UI
// ============================================================
// ============================================================
// 文明追踪
// ============================================================
function trackCiv(civId: string): void {
  trackedCivId = civId;
  trackedHistory = [];
  const panel = document.getElementById('tracking-panel')!;
  panel.style.display = 'block';
}

function untrackCiv(): void {
  trackedCivId = null;
  trackedHistory = [];
  const panel = document.getElementById('tracking-panel')!;
  panel.style.display = 'none';
}

// ---- 文明详情弹窗 ----
function showCivDetail(civId: string): void {
  const civ = civilizations.find(c => c.id === civId);
  if (!civ) return;
  // 弹出详情时释放指针，以便操作按钮
  if (document.pointerLockElement) document.exitPointerLock();

  const overlay = document.getElementById('civ-detail-overlay')!;
  document.getElementById('detail-name')!.textContent = civ.name;
  document.getElementById('detail-name')!.style.color = civ.color;

  const tech = getOverallTech(civ.techTree);
  const statusParts: string[] = [];
  if (!civ.alive) statusParts.push('💀 已灭亡');
  else if (civ.inBlackDomain) statusParts.push('🌑 黑域中');
  else if (civ.warState?.status === 'active') statusParts.push('⚔️ 交战中');
  else if (civ.stealthActive) statusParts.push('🫥 隐藏中');
  else if (civ.activeSpellTargetId) statusParts.push('🪄 咒语广播中');
  else statusParts.push('🌐 活跃');

  const genLabel = civ.generation === 'ancient' ? '◆ 古老文明' :
    civ.generation === 'elder' ? '◇ 长者文明' :
    civ.generation === 'mature' ? '成熟文明' : civ.isFugitive ? '🚀 逃亡者' : '年轻文明';

  const govLabel: Record<string, string> = {
    democracy: '民主制', authoritarian: '独裁制', hive_mind: '蜂群思维',
    oligarchy: '寡头制', anarchy: '无政府',
  };

  let knownList = '';
  for (const [kid, k] of civ.knownCivs) {
    const kc = civilizations.find(c => c.id === kid);
    const kname = kc ? kc.name : '未知文明';
    const alive = kc ? (kc.alive ? '存活' : '已灭') : '?';
    knownList += `<tr><td>${kname}</td><td style="color:#8b949e;">猜疑 ${(k.suspicionIndex*100).toFixed(0)}%</td><td>追踪 ${(k.targetingProgress*100).toFixed(0)}%</td><td>${alive}</td></tr>`;
  }

  document.getElementById('detail-content')!.innerHTML = `
    <div class="stat-row"><span class="stat-label">世代</span><span class="stat-value">${genLabel}</span></div>
    <div class="stat-row"><span class="stat-label">政体</span><span class="stat-value">${govLabel[civ.politics.governmentType] || civ.politics.governmentType}</span></div>
    <div class="stat-row"><span class="stat-label">稳定度</span><span class="stat-value">${(civ.politics.stability*100).toFixed(0)}% | 恐惧 ${(civ.politics.publicFear*100).toFixed(0)}%</span></div>
    <div class="stat-row"><span class="stat-label">人口</span><span class="stat-value">${Math.floor(civ.population).toLocaleString()}</span></div>
    <div class="stat-row"><span class="stat-label">资源</span><span class="stat-value">${Math.floor(civ.resources).toLocaleString()}</span></div>
    <div class="stat-row"><span class="stat-label">综合科技</span><span class="stat-value good">${tech.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">武器·探测·隐匿</span><span class="stat-value">${civ.techTree.weapons.toFixed(1)} · ${civ.techTree.detection.toFixed(1)} · ${civ.techTree.stealth.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">推进·通讯·认知·经济</span><span class="stat-value">${civ.techTree.propulsion.toFixed(1)} · ${civ.techTree.communication.toFixed(1)} · ${civ.techTree.cognition.toFixed(1)} · ${civ.techTree.economics.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">掌控/探测范围</span><span class="stat-value">${civ.controlRadius.toFixed(0)} / ${civ.detectionRadius.toFixed(0)}</span></div>
    <div class="stat-row"><span class="stat-label">信号强度</span><span class="stat-value">${civ.signalStrength.toFixed(3)}</span></div>
    <div class="stat-row"><span class="stat-label">状态</span><span class="stat-value">${statusParts.join(' ')}</span></div>
    <div class="stat-row"><span class="stat-label">策略</span><span class="stat-value">攻${civ.strategy.aggression.toFixed(2)} 慎${civ.strategy.caution.toFixed(2)} 合${civ.strategy.cooperation.toFixed(2)} 扩${civ.strategy.expansionism.toFixed(2)}</span></div>
    <div class="stat-row"><span class="stat-label">诞生</span><span class="stat-value">Tick ${civ.birthTick}</span></div>
    ${!civ.alive ? `<div class="stat-row"><span class="stat-label danger">灭亡</span><span class="stat-value danger">${civ.causeOfDeath || '未知'} ${civ.inBlackDomain ? '(黑域中)' : ''}</span></div>` : ''}
    ${civ.isFugitive && civ.fugitiveOriginId ? `<div class="stat-row"><span class="stat-label">来源</span><span class="stat-value">${civilizations.find(c=>c.id===civ.fugitiveOriginId)?.name || '未知'} 的幸存者</span></div>` : ''}
    ${civ.warState ? `<div class="stat-row"><span class="stat-label warn">战争状态</span><span class="stat-value warn">vs ${civilizations.find(c=>c.id===civ.warState!.enemyId)?.name || '?'} | 疲劳 ${(civ.warState!.myExhaustion*100).toFixed(0)}%</span></div>` : ''}
    <div style="margin-top:8px;font-size:11px;color:#8b949e;">已知文明 (${civ.knownCivs.size}):</div>
    <table style="width:100%;font-size:11px;color:#c9d1d9;margin-top:2px;">${knownList || '<tr><td style="color:#484f58;">— 未探测到其他文明 —</td></tr>'}</table>
  `;

  (document.getElementById('btn-track-detail')! as any)._civId = civId;
  (document.getElementById('btn-track-detail')! as HTMLButtonElement).style.display = '';
  overlay.style.display = 'flex';
}

function hideCivDetail(): void {
  document.getElementById('civ-detail-overlay')!.style.display = 'none';
  renderer.selectSystem(null);
}

// ---- 恒星详情弹窗 ----
function showStarDetail(star: import('./types').StarRenderData): void {
  if (document.pointerLockElement) document.exitPointerLock();

  const overlay = document.getElementById('civ-detail-overlay')!;
  const nameEl = document.getElementById('detail-name')!;
  nameEl.textContent = star.name;
  nameEl.style.color = star.starColor;

  const typeLabels: Record<string, string> = {
    red_dwarf: '红矮星', yellow_dwarf: '黄矮星', blue_giant: '蓝巨星',
    white_dwarf: '白矮星', neutron: '中子星', black_hole: '黑洞',
  };
  const statusParts: string[] = [];
  if (star.destroyed) statusParts.push(`💥 已摧毁 (${star.destroyCause || '未知原因'})`);
  if (star.inBlackDomain) statusParts.push('🌑 黑域中');
  if (star.inDualVectorZone) statusParts.push('📐 已二维化');
  if (!star.destroyed && !star.inBlackDomain && !star.inDualVectorZone) statusParts.push('⭐ 正常');

  const content = document.getElementById('detail-content')!;
  content.innerHTML = `
    <div class="stat-row"><span class="stat-label">类型</span><span class="stat-value">${typeLabels[star.starType] || star.starType}</span></div>
    <div class="stat-row"><span class="stat-label">大小</span><span class="stat-value">${star.starSize.toFixed(1)}</span></div>
    <div class="stat-row"><span class="stat-label">行星数</span><span class="stat-value">${star.planetCount} (${star.occupiedPlanetCount} 有文明)</span></div>
    <div class="stat-row"><span class="stat-label">状态</span><span class="stat-value">${statusParts.join(' ')}</span></div>
    ${star.destroyed ? `<div class="stat-row"><span class="stat-label">摧毁于</span><span class="stat-value">Tick ${star.destroyedAt}</span></div>` : ''}
    <div class="stat-row"><span class="stat-label">坐标</span><span class="stat-value">(${star.x.toFixed(0)}, ${star.y.toFixed(0)}, ${star.z.toFixed(0)})</span></div>
    <div style="margin-top:8px;font-size:11px;color:#8b949e;">
      ${star.destroyed
        ? '这颗恒星已被摧毁。残骸云将在数百 tick 内缓慢消散。'
        : star.inBlackDomain
        ? '这个星系处于黑域中——光速被降至极低，成为一个绝对安全的牢笼。'
        : star.inDualVectorZone
        ? '这个星系已被二向箔二维化——这是宇宙的永久伤痕。'
        : '双击星系中的文明以查看详细信息。'}
    </div>
  `;

  (document.getElementById('btn-track-detail')! as any)._civId = null;
  (document.getElementById('btn-track-detail')! as HTMLButtonElement).style.display = 'none';

  overlay.style.display = 'flex';
}

function updateTrackingPanel(): void {
  if (!trackedCivId) return;
  const civ = civilizations.find(c => c.id === trackedCivId);
  if (!civ) { untrackCiv(); return; }

  // 记录历史
  if (tick % 10 === 0) {
    trackedHistory.push({
      tick, pop: civ.population, res: civ.resources,
      tech: getOverallTech(civ.techTree), weapons: civ.techTree.weapons,
    });
    if (trackedHistory.length > 200) trackedHistory = trackedHistory.slice(-200);
  }

  // 更新面板
  document.getElementById('tr-name')!.textContent = civ.name;
  document.getElementById('tr-generation')!.textContent =
    civ.generation === 'ancient' ? '◆ 古老' : civ.generation === 'elder' ? '◇ 长者' :
    civ.generation === 'mature' ? '成熟' : civ.isFugitive ? '逃亡者' : '年轻';
  document.getElementById('tr-gov')!.textContent = civ.politics.governmentType;
  document.getElementById('tr-pop')!.textContent = String(Math.floor(civ.population));
  document.getElementById('tr-res')!.textContent = String(Math.floor(civ.resources));
  document.getElementById('tr-tech')!.textContent = getOverallTech(civ.techTree).toFixed(1);
  document.getElementById('tr-weapons')!.textContent =
    `${civ.techTree.weapons.toFixed(1)} / ${civ.techTree.detection.toFixed(1)} / ${civ.techTree.stealth.toFixed(1)}`;
  document.getElementById('tr-signal')!.textContent = civ.signalStrength.toFixed(2);
  const statusParts: string[] = [];
  if (!civ.alive) statusParts.push('💀 已灭亡');
  else if (civ.inBlackDomain) statusParts.push('🌑 黑域中');
  else if (civ.warState?.status === 'active') statusParts.push('⚔️ 交战中');
  else if (civ.stealthActive) statusParts.push('🫥 隐藏');
  else if (civ.activeSpellTargetId) statusParts.push('🪄 咒语中');
  else statusParts.push('🌐 活跃');
  document.getElementById('tr-status')!.textContent = statusParts.join(' ');
  document.getElementById('tr-known')!.textContent = String(civ.knownCivs.size);
  document.getElementById('tr-strategy')!.textContent =
    `攻${civ.strategy.aggression.toFixed(1)} 慎${civ.strategy.caution.toFixed(1)} 合${civ.strategy.cooperation.toFixed(1)}`;
  document.getElementById('tr-born')!.textContent = `Tick ${civ.birthTick}`;

  if (!civ.alive) {
    document.getElementById('tr-death-row')!.style.display = 'flex';
    document.getElementById('tr-death')!.textContent = civ.causeOfDeath || '未知';
  } else {
    document.getElementById('tr-death-row')!.style.display = 'none';
  }

  // 更新追踪图表
  updateTrackChart();
}

function updateTrackChart(): void {
  const canvas = document.getElementById('chart-tracked') as HTMLCanvasElement;
  if (!canvas || trackedHistory.length < 2) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 用简易 Canvas 绘制（避免引入额外 Chart.js 实例的复杂性）
  const w = canvas.width || canvas.clientWidth * 2;
  const h = canvas.height || 100 * 2;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const data = trackedHistory;
  const margin = { top: 5, right: 5, bottom: 5, left: 5 };
  const pw = w - margin.left - margin.right;
  const ph = h - margin.top - margin.bottom;

  // 找范围
  const maxTech = Math.max(1, ...data.map(d => d.tech));
  const minTick = data[0].tick;
  const maxTick = data[data.length - 1].tick;
  const tickRange = Math.max(1, maxTick - minTick);

  const toX = (t: number) => margin.left + ((t - minTick) / tickRange) * pw;
  const toY = (v: number) => margin.top + ph - (v / maxTech) * ph;

  // 科技线
  ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = toX(data[i].tick), y = toY(data[i].tech);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 武器线
  ctx.strokeStyle = '#f85149'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = toX(data[i].tick), y = toY(data[i].weapons);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 标签
  ctx.fillStyle = '#8b949e'; ctx.font = '9px sans-serif';
  ctx.fillText('蓝=科技 红=武器', margin.left, margin.top + 10);
}

// ============================================================
// 模拟总结
// ============================================================
function showSummary(): void {
  const overlay = document.getElementById('summary-overlay')!;
  const content = document.getElementById('summary-content')!;
  const subtitle = document.getElementById('summary-subtitle')!;

  subtitle.textContent = `总持续时间: ${tick} tick | 存活文明: ${civilizations.filter(c => c.alive).length} | 累计灭绝: ${totalDeaths}`;

  // 统计灭绝原因
  const causeEntries = Object.entries(deathsByCause).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  // 最成功的文明（活得最久或科技最高）
  const deadCivs = civilizations.filter(c => !c.alive && c.causeOfDeath);
  const longestLived = [...civilizations].sort((a, b) =>
    (b.causeOfDeath ? tick : b.birthTick) - (a.causeOfDeath ? tick : a.birthTick))[0];

  // 策略生存率
  const stratCounts: Record<string, { alive: number; dead: number }> = {};
  for (const civ of civilizations) {
    const label = getStrategyLabel(civ.strategy);
    if (!stratCounts[label]) stratCounts[label] = { alive: 0, dead: 0 };
    if (civ.alive) stratCounts[label].alive++;
    else stratCounts[label].dead++;
  }

  // 世代生存率
  const genCounts: Record<string, { alive: number; dead: number }> = {};
  for (const civ of civilizations) {
    const g = civ.generation;
    if (!genCounts[g]) genCounts[g] = { alive: 0, dead: 0 };
    if (civ.alive) genCounts[g].alive++;
    else genCounts[g].dead++;
  }

  let html = '';

  // 灭绝原因
  html += '<h3 style="color:#f85149;margin-bottom:8px;">💀 灭绝原因分析</h3>';
  html += '<table style="width:100%;font-size:13px;color:#c9d1d9;">';
  for (const [cause, count] of causeEntries) {
    html += `<tr><td>${cause}</td><td style="text-align:right;font-weight:600;">${count}</td><td style="color:#8b949e;">(${(count/totalDeaths*100).toFixed(0)}%)</td></tr>`;
  }
  html += '</table>';

  // 策略生存率
  html += '<h3 style="color:#d29922;margin:16px 0 8px;">🎯 策略生存率</h3>';
  html += '<table style="width:100%;font-size:13px;color:#c9d1d9;">';
  for (const [label, counts] of Object.entries(stratCounts)) {
    const total = counts.alive + counts.dead;
    const rate = total > 0 ? (counts.alive / total * 100).toFixed(0) : '0';
    html += `<tr><td>${label}</td><td style="text-align:right;">存活 ${counts.alive} / 共 ${total}</td><td style="color:#3fb950;">${rate}%</td></tr>`;
  }
  html += '</table>';

  // 世代生存率
  html += '<h3 style="color:#58a6ff;margin:16px 0 8px;">👤 世代生存率</h3>';
  html += '<table style="width:100%;font-size:13px;color:#c9d1d9;">';
  for (const [gen, counts] of Object.entries(genCounts)) {
    const total = counts.alive + counts.dead;
    const rate = total > 0 ? (counts.alive / total * 100).toFixed(0) : '0';
    const name = gen === 'ancient' ? '古老' : gen === 'elder' ? '长者' : gen === 'mature' ? '成熟' : '年轻';
    html += `<tr><td>${name}</td><td style="text-align:right;">存活 ${counts.alive} / 共 ${total}</td><td style="color:#3fb950;">${rate}%</td></tr>`;
  }
  html += '</table>';

  // 关键统计
  html += '<h3 style="color:#bc8cff;margin:16px 0 8px;">📊 关键数据</h3>';
  const avgTech = civilizations.filter(c => c.alive).reduce((s, c) => s + getOverallTech(c.techTree), 0) /
    Math.max(1, civilizations.filter(c => c.alive).length);
  html += `<div style="font-size:13px;color:#c9d1d9;line-height:1.8;">
    光粒打击: <b>${totalPhotoid}次</b>（死亡${deathsByCause['光粒打击'] || 0}）<br>
    降维打击(二向箔): <b>${totalDual}次</b>（直接死亡${deathsByCause['二向箔打击'] || 0}，波及${deathsByCause['二向箔波及'] || 0}，扩散${deathsByCause['二向箔扩散'] || 0}）<br>
    黑域创建: <b>${totalBlackDomains}</b><br>
    星际战争: <b>${totalWars}</b><br>
    探测事件: <b>${totalDetections}</b><br>
    当前平均科技: <b>${avgTech.toFixed(1)}</b><br>
    二向箔区域: <b>${dualVectorZones.length}</b> 个（永久改变宇宙结构）
  </div>`;

  // 结论
  html += '<h3 style="color:#e6edf3;margin:16px 0 8px;">🧠 黑暗森林评估</h3>';
  const photoidDeaths = deathsByCause['光粒打击'] || 0;
  const dimStrikeDeaths = (deathsByCause['二向箔打击'] || 0) + (deathsByCause['二向箔波及'] || 0) + (deathsByCause['二向箔扩散'] || 0);
  const darkForestDeaths = photoidDeaths + dimStrikeDeaths;
  const warDeaths = deathsByCause['星际战争败亡'] || 0;
  const naturalDeaths = (deathsByCause['资源枯竭'] || 0) + (deathsByCause['内部崩溃'] || 0) +
    (deathsByCause['黑域中消亡'] || 0);

  if (darkForestDeaths > warDeaths + naturalDeaths) {
    let verdict = `⚠️ 黑暗森林打击是主要灭绝原因（${darkForestDeaths}例，占${(darkForestDeaths/totalDeaths*100).toFixed(0)}%）。`;
    verdict += ` 其中光粒打击 ${photoidDeaths} 例，降维打击（二向箔）${dimStrikeDeaths} 例。`;
    if (dimStrikeDeaths > photoidDeaths) verdict += ' 降维打击的蔓延性使其成为最恐怖的清理手段。';
    html += `<p style="color:#f85149;font-size:14px;">${verdict}</p>`;
  } else if (warDeaths > darkForestDeaths) {
    html += `<p style="color:#d29922;font-size:14px;">⚔️ 星际战争是主要灭绝原因（${warDeaths}例）。邻近文明间的常规冲突比远程打击更频繁。</p>`;
  } else {
    html += `<p style="color:#58a6ff;font-size:14px;">🌐 自然/内部原因是主要灭绝原因（${naturalDeaths}例）。</p>`;
  }

  content.innerHTML = html;

  // 时间线
  const tl = document.getElementById('summary-timeline')!;
  tl.innerHTML = eventTimeline.slice(-40).map(e =>
    `<div><span style="color:#484f58;">[T${e.tick}]</span> <span style="color:${e.color};">${e.text}</span></div>`
  ).join('') || '<div style="color:#484f58;">暂无关键事件</div>';

  overlay.style.display = 'block';
}

function hideSummary(): void {
  document.getElementById('summary-overlay')!.style.display = 'none';
}

// ---- 导出 ----
function exportData(): void {
  const data = {
    tick, totalDeaths, totalPhotoid, totalDual, totalBlackDomains,
    totalDetections, totalWars,
    deathsByCause,
    aliveCount: civilizations.filter(c => c.alive).length,
    avgTech: civilizations.filter(c => c.alive).reduce((s, c) => s + getOverallTech(c.techTree), 0) /
      Math.max(1, civilizations.filter(c => c.alive).length),
    civDetails: civilizations.map(c => ({
      name: c.name, generation: c.generation,
      alive: c.alive, causeOfDeath: c.causeOfDeath,
      tech: getOverallTech(c.techTree),
      weapons: c.techTree.weapons,
      population: c.population,
      resources: c.resources,
      strategy: getStrategyLabel(c.strategy),
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dark_forest_tick${tick}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ---- 对比快照 ----
let compareSnapshot: any = null;
function takeSnapshot(): void {
  compareSnapshot = {
    tick, totalDeaths, totalPhotoid, totalDual, totalWars,
    aliveCount: civilizations.filter(c => c.alive).length,
    avgTech: civilizations.filter(c => c.alive).reduce((s, c) => s + getOverallTech(c.techTree), 0) /
      Math.max(1, civilizations.filter(c => c.alive).length),
    deathsByCause: { ...deathsByCause },
  };
  updateComparePanel();
}
function updateComparePanel(): void {
  const panel = document.getElementById('compare-panel')!;
  const content = document.getElementById('compare-content')!;
  const now = {
    tick, totalDeaths, totalPhotoid, totalDual, totalWars,
    aliveCount: civilizations.filter(c => c.alive).length,
    avgTech: civilizations.filter(c => c.alive).reduce((s, c) => s + getOverallTech(c.techTree), 0) /
      Math.max(1, civilizations.filter(c => c.alive).length),
  };
  if (compareSnapshot) {
    content.innerHTML = `
      <table style="width:100%;">
        <tr><td></td><td style="color:#58a6ff;">快照 T${compareSnapshot.tick}</td><td style="color:#3fb950;">当前 T${now.tick}</td></tr>
        <tr><td>存活</td><td>${compareSnapshot.aliveCount}</td><td>${now.aliveCount}</td></tr>
        <tr><td>灭绝</td><td>${compareSnapshot.totalDeaths}</td><td>${now.totalDeaths}</td></tr>
        <tr><td>光粒打击</td><td>${compareSnapshot.totalPhotoid}</td><td>${now.totalPhotoid}</td></tr>
        <tr><td>平均科技</td><td>${compareSnapshot.avgTech.toFixed(1)}</td><td>${now.avgTech.toFixed(1)}</td></tr>
      </table>`;
  }
  panel.style.display = 'block';
}

// 时间线数据（记录关键事件）
let eventTimeline: Array<{ tick: number; text: string; color: string }> = [];
function addTimelineEvent(tick: number, text: string, color: string = '#c9d1d9'): void {
  eventTimeline.push({ tick, text, color });
  if (eventTimeline.length > 100) eventTimeline = eventTimeline.slice(-100);
}

function setupUI(): void {
  uiManager = new UIManager({
    onPauseToggle: () => { paused = !paused; },
    onSpeedChange: s => { speed = s; },
    onStep: () => { simTick(); },
    onReset: () => { init(); eventBus.clear();
      document.getElementById('event-log')!.innerHTML = '<div class="event-line" style="color:#484f58">已重置</div>'; },
    onPresetSelect: (k: string) => {
      const p = SCENARIOS[k]; if (!p) return;
      pendingCivCount = p.civCount; pendingResourceAbundance = p.resourceAbundance;
      pendingDetectionEfficiency = p.detectionEfficiency;
      pendingSuspicionEnabled = p.suspicionEnabled;
      CONFIG.resourceAbundance = p.resourceAbundance;
      CONFIG.universeSize = p.universeSize;
      init(); eventBus.clear();
      document.getElementById('event-log')!.innerHTML =
        `<div class="event-line" style="color:#3fb950">🎬 ${p.name} — ${p.description}</div>`;
    },
    onParamChange: (k: string, v: number) => {
      if (k==='civCount') pendingCivCount = v;
      else if (k==='resourceAbundance') { pendingResourceAbundance=v; CONFIG.resourceAbundance=v; }
      else if (k==='detectionEfficiency') pendingDetectionEfficiency=v;
    },
  });
}

function main(): void {
  console.log('%c🪐 黑暗森林 v5 %c星系·行星·恒星残骸',
    'font-size:18px;color:#f85149;','font-size:14px;color:#8b949e;');
  const canvas = document.getElementById('universe-canvas') as HTMLCanvasElement;
  renderer = new Renderer(canvas);
  chartManager = new ChartManager();
  setupUI(); init();
  window.addEventListener('resize', () => renderer.resize());
  canvas.addEventListener('mousemove', e => positionTooltip(e));

  // 双击已废弃——单击锁定已包含全部信息展示

  // 详情弹窗按钮
  document.getElementById('btn-track-detail')!.addEventListener('click', () => {
    const civId = (document.getElementById('btn-track-detail')! as any)._civId;
    if (civId) { trackCiv(civId); hideCivDetail(); }
  });
  document.getElementById('btn-close-detail')!.addEventListener('click', hideCivDetail);
  // ESC 关闭详情 + 释放指针
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideCivDetail();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  });
  // 点击遮罩关闭
  document.getElementById('civ-detail-overlay')!.addEventListener('click', e => {
    if ((e.target as HTMLElement).id === 'civ-detail-overlay') hideCivDetail();
  });

  // 取消追踪按钮
  document.getElementById('btn-untrack')!.addEventListener('click', untrackCiv);

  // 总结按钮
  const btnSummary = document.createElement('button');
  btnSummary.textContent = '📊 总结';
  btnSummary.title = '显示模拟总结与分析';
  btnSummary.style.cssText = 'background:#1a3a5c;border:1px solid #1f6feb;color:#58a6ff;';
  btnSummary.addEventListener('click', showSummary);
  document.getElementById('controls')!.appendChild(btnSummary);

  // 关闭总结
  document.getElementById('btn-close-summary')!.addEventListener('click', hideSummary);
  // 导出
  document.getElementById('btn-export')!.addEventListener('click', exportData);
  // 对比快照
  document.getElementById('btn-compare-snapshot')!.addEventListener('click', takeSnapshot);
  document.getElementById('btn-compare-close')!.addEventListener('click', () => {
    document.getElementById('compare-panel')!.style.display = 'none';
  });

  lastFrame = performance.now();
  afId = requestAnimationFrame(loop);
  console.log('✅ 就绪 — 拖拽旋转 | 右键平移 | WASD移动 | 滚轮缩放 | 点击追踪 | 📊总结');
}
main();

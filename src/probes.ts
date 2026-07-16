// ============================================================
// 探测器系统 — 文明的"深空之眼"
// ============================================================
import type { Civilization, Probe, SimEvent } from './types';
import { CONFIG } from './config';
import type { Universe } from './universe';

let probeIdCounter = 0;

export function createProbe(owner: Civilization): Probe {
  return {
    id: `pr_${(probeIdCounter++).toString(36)}`,
    ownerId: owner.id,
    x: owner.x, y: owner.y, z: owner.z,
    vx: (Math.random() - 0.5) * CONFIG.probeSpeed * 2,
    vy: (Math.random() - 0.5) * CONFIG.probeSpeed * 2,
    vz: (Math.random() - 0.5) * CONFIG.probeSpeed * 2,
    detectionRadius: CONFIG.probeDetectionRadius,
    signalStrength: CONFIG.probeSignalStrength,
    launchedAt: 0,
    alive: true,
    captured: false,
    capturedById: null,
  };
}

export function updateProbes(
  probes: Probe[], civs: Civilization[], universe: Universe,
  tick: number,
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const probe of probes) {
    if (!probe.alive) continue;

    // 移动
    probe.x += probe.vx;
    probe.y += probe.vy;
    probe.z += probe.vz;
    const half = universe.size / 2;
    if (Math.abs(probe.x) > half || Math.abs(probe.y) > half || Math.abs(probe.z) > half) {
      probe.alive = false; continue;
    }

    // 探测范围内的文明
    for (const civ of civs) {
      if (!civ.alive || civ.id === probe.ownerId) continue;
      const dist = universe.distance(probe, civ);
      if (dist < probe.detectionRadius && Math.random() < 0.1) {
        // 探测器的拥有者获得信息
        const owner = civs.find(c => c.id === probe.ownerId);
        if (owner && !owner.knownCivs.has(civ.id)) {
          owner.knownCivs.set(civ.id, {
            civId: civ.id, discoveredAt: tick,
            estimatedTech: civ.techTree.weapons + civ.techTree.detection,
            estimatedIntent: 0.3,
            suspicionIndex: 0.2, suspicionDepth: 1,
            lastObservedAt: tick, observationCount: 1,
            targetingProgress: 0.15,
            observationHistory: [],
          });
          events.push({
            tick, type: 'detection',
            sourceId: owner.id, sourceName: owner.name,
            targetId: civ.id, targetName: civ.name,
            detail: `🛰 ${owner.name} 的探测器发现了 ${civ.name}`,
          });
        }
      }
    }

    // 探测器被其他文明捕获
    for (const civ of civs) {
      if (!civ.alive || civ.id === probe.ownerId) continue;
      const dist = universe.distance(probe, civ);
      if (dist < civ.controlRadius && Math.random() < CONFIG.probeCaptureProb) {
        probe.captured = true;
        probe.capturedById = civ.id;
        probe.alive = false;
        events.push({
          tick, type: 'detection',
          sourceId: civ.id, sourceName: civ.name,
          detail: `📡 ${civ.name} 捕获了一枚来自未知文明的探测器`,
        });
        // 反向追溯概率
        if (Math.random() < CONFIG.probeTracebackProb) {
          const owner = civs.find(c => c.id === probe.ownerId);
          if (owner && !civ.knownCivs.has(owner.id)) {
            civ.knownCivs.set(owner.id, {
              civId: owner.id, discoveredAt: tick,
              estimatedTech: owner.techTree.weapons,
              estimatedIntent: 0.5,
              suspicionIndex: 0.4, suspicionDepth: 2,
              lastObservedAt: tick, observationCount: 2,
              targetingProgress: 0.4,
              observationHistory: [],
            });
            events.push({
              tick, type: 'detection',
              sourceId: civ.id, sourceName: civ.name,
              targetId: owner.id, targetName: owner.name,
              detail: `🔍 ${civ.name} 从捕获的探测器中追溯到了 ${owner.name} 的坐标`,
            });
          }
        }
      }
    }
  }

  return events;
}

// ============================================================
// 黑暗森林模拟器 — 科技树子系统 v2
// ============================================================

import type { TechTree, TechBreakthrough, CivGeneration } from './types';
import { CONFIG } from './config';

/**
 * 创建初始科技树——根据文明世代不同，初始科技水平差异巨大。
 */
export function createTechTree(generation: CivGeneration): TechTree {
  const base = CONFIG.initialTechBase;

  // 世代加成
  let bonus = 0;
  switch (generation) {
    case 'ancient': bonus = CONFIG.ancientTechBonus; break;
    case 'elder': bonus = CONFIG.elderTechBonus; break;
    case 'mature': bonus = CONFIG.matureTechBonus; break;
    case 'young': bonus = CONFIG.youngTechBonus; break;
  }

  const variance = CONFIG.initialTechVariance;
  const rand = () => Math.max(0, base + bonus + (Math.random() - 0.5) * variance * 2);

  return {
    detection: rand(),
    stealth: rand(),
    weapons: rand(),
    propulsion: rand(),
    communication: rand(),
    cognition: rand(),
    economics: rand(),
  };
}

/**
 * 综合科技水平（加权平均）。
 */
export function getOverallTech(tech: TechTree): number {
  const weights = {
    detection: 1.2,
    stealth: 1.0,
    weapons: 1.5,
    propulsion: 1.0,
    communication: 0.8,
    cognition: 1.3,
    economics: 1.0,
  };
  let total = 0, totalWeight = 0;
  for (const [key, w] of Object.entries(weights)) {
    total += tech[key as keyof TechTree] * w;
    totalWeight += w;
  }
  return Math.round(total / totalWeight * 10) / 10;
}

/**
 * 每 tick 科技进步。
 */
export function advanceTech(tech: TechTree, resourcePressure: number): TechTree {
  const rate = CONFIG.techGrowthBase * (1 + resourcePressure * 0.5);
  return {
    detection: tech.detection + rate * (0.7 + Math.random() * 0.6),
    stealth: tech.stealth + rate * (0.7 + Math.random() * 0.6),
    weapons: tech.weapons + rate * (0.7 + Math.random() * 0.6),
    propulsion: tech.propulsion + rate * (0.7 + Math.random() * 0.6),
    communication: tech.communication + rate * (0.7 + Math.random() * 0.6),
    cognition: tech.cognition + rate * (0.7 + Math.random() * 0.6),
    economics: tech.economics + rate * (0.7 + Math.random() * 0.6),
  };
}

/**
 * 检查技术爆炸。
 */
export function checkBreakthrough(
  tech: TechTree,
  resourcePressure: number,
  hasObservedThreat: boolean,
  cooldown: number,
): TechBreakthrough | null {
  if (cooldown > 0) return null;

  let prob = CONFIG.techBreakthroughBaseProb;
  prob *= 1 + resourcePressure * CONFIG.techBreakthroughPressureMult;
  if (hasObservedThreat) prob *= 2.5;

  if (Math.random() < prob) {
    const fields: (keyof TechTree)[] = [
      'detection', 'stealth', 'weapons', 'propulsion',
      'communication', 'cognition', 'economics',
    ];
    // 反比加权：弱项更容易突破
    const weights = fields.map(f => 1 / (tech[f] + 1));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalW;
    let chosenIdx = 0;
    for (let i = 0; i < fields.length; i++) {
      r -= weights[i];
      if (r <= 0) { chosenIdx = i; break; }
    }

    const magnitude = CONFIG.techBreakthroughMinMagnitude +
      Math.random() * (CONFIG.techBreakthroughMaxMagnitude - CONFIG.techBreakthroughMinMagnitude);

    const trigger: TechBreakthrough['trigger'] = hasObservedThreat
      ? (Math.random() < 0.6 ? 'observation' : 'pressure')
      : (resourcePressure > 0.5 ? 'pressure' : 'random');

    return { field: fields[chosenIdx], magnitude, trigger, tick: 0 };
  }

  return null;
}

/**
 * 应用技术爆炸。
 */
export function applyBreakthrough(tech: TechTree, bt: TechBreakthrough): TechTree {
  const updated = { ...tech };
  updated[bt.field] += bt.magnitude;
  return updated;
}

/**
 * "捡尸体"——从被摧毁文明吸收科技。
 */
export function salvageTech(winner: TechTree, loser: TechTree): TechTree {
  const rate = CONFIG.salvageTechBonus;
  const result = { ...winner };
  for (const key of Object.keys(winner) as (keyof TechTree)[]) {
    if (loser[key] > winner[key]) {
      result[key] += (loser[key] - winner[key]) * rate;
    }
  }
  return result;
}

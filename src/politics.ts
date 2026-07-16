// ============================================================
// 黑暗森林模拟器 — 内部政治子系统
// Dark Forest Simulator — Internal Politics
// ============================================================

import type { Politics, Faction, GovernmentType } from './types';
import { DEFAULT_FACTIONS } from './types';
import { CONFIG } from './config';

const GOV_NAMES: Record<GovernmentType, string> = {
  democracy: '民主制',
  authoritarian: '独裁制',
  hive_mind: '蜂群思维',
  oligarchy: '寡头制',
  anarchy: '无政府',
};

/**
 * 随机生成初始政治体制。
 * 蜂群思维和无政府比较稀有。
 */
export function createPolitics(): Politics {
  const roll = Math.random();
  let govType: GovernmentType;

  if (roll < 0.35) govType = 'authoritarian';
  else if (roll < 0.65) govType = 'democracy';
  else if (roll < 0.80) govType = 'oligarchy';
  else if (roll < 0.92) govType = 'hive_mind';
  else govType = 'anarchy';

  const factions = DEFAULT_FACTIONS[govType].map(f => ({
    ...f,
    power: f.power * (0.8 + Math.random() * 0.4), // 加点随机波动
  }));
  // 归一化派系力量
  const total = factions.reduce((s, f) => s + f.power, 0);
  factions.forEach(f => { f.power /= total; });

  return {
    governmentType: govType,
    stability: 0.5 + Math.random() * 0.4, // 0.5-0.9
    factions,
    decisionDelay: CONFIG.decisionDelayByGovernment[govType],
    publicFear: 0.1 + Math.random() * 0.2,
  };
}

/**
 * 每 tick 更新内部政治状态。
 * 恐惧度影响稳定性，派系力量随环境变化。
 */
export function updatePolitics(
  politics: Politics,
  hasDetectedThreat: boolean,
  wasAttacked: boolean,
): Politics {
  const updated = { ...politics };
  let fear = updated.publicFear;

  // 恐惧自然衰减
  fear = Math.max(0, fear - CONFIG.fearDecayRate);

  // 探测到威胁增加恐惧
  if (hasDetectedThreat) {
    fear = Math.min(1, fear + CONFIG.fearFromDetection);
  }

  // 遭受攻击大幅增加恐惧
  if (wasAttacked) {
    fear = Math.min(1, fear + CONFIG.fearFromStrike);
  }

  updated.publicFear = fear;

  // 恐惧影响稳定性
  if (fear > CONFIG.stabilityFearThreshold) {
    const fearPenalty = (fear - CONFIG.stabilityFearThreshold) * 0.5;
    updated.stability = Math.max(0.1, updated.stability - fearPenalty * 0.01);
  } else {
    // 没有恐惧时稳定性缓慢恢复
    updated.stability = Math.min(1, updated.stability + 0.002);
  }

  // 派系力量变化：恐惧增加鹰派力量，减少鸽派力量
  if (hasDetectedThreat || wasAttacked) {
    updated.factions = updated.factions.map(f => {
      const p = { ...f };
      if (f.attitude === 'hawk') {
        p.power = Math.min(1, f.power + CONFIG.factionPowerShiftRate * fear * 2);
      } else if (f.attitude === 'dove') {
        p.power = Math.max(0.05, f.power - CONFIG.factionPowerShiftRate * fear * 2);
      }
      return p;
    });
    // 重新归一化
    const total = updated.factions.reduce((s, f) => s + f.power, 0);
    updated.factions.forEach(f => { f.power /= total; });
  }

  return updated;
}

/**
 * 获取主导派系的态度。
 * 用于影响文明的整体决策倾向。
 */
export function getDominantAttitude(politics: Politics): Faction['attitude'] {
  let dominant = politics.factions[0];
  for (const f of politics.factions) {
    if (f.power > dominant.power) dominant = f;
  }
  return dominant.attitude;
}

/**
 * 获取鹰派的综合力量比例（影响攻击决策）。
 */
export function getHawkishness(politics: Politics): number {
  return politics.factions
    .filter(f => f.attitude === 'hawk' || f.attitude === 'expansionist')
    .reduce((s, f) => s + f.power, 0);
}

/**
 * 获取鸽派（合作倾向）的综合力量比例。
 */
export function getDovishness(politics: Politics): number {
  return politics.factions
    .filter(f => f.attitude === 'dove')
    .reduce((s, f) => s + f.power, 0);
}

/**
 * 政府类型的中文名称。
 */
export function getGovernmentName(govType: GovernmentType): string {
  return GOV_NAMES[govType];
}

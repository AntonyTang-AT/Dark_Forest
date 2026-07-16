// ============================================================
// 联盟系统 + 科技传播
// ============================================================
import type { Civilization, Alliance, SimEvent } from './types';
import { CONFIG } from './config';
import { getOverallTech } from './tech_tree';
import { getHawkishness } from './politics';

let allianceIdCounter = 0;

/** 尝试在两个文明之间建立或加入联盟 */
export function tryFormAlliance(
  civ: Civilization, other: Civilization, tick: number,
  alliances: Alliance[],
): SimEvent | null {
  if (!CONFIG.allianceEnabled) return null;
  if (civ.allianceId && other.allianceId && civ.allianceId === other.allianceId) return null;
  if (civ.warState || other.warState) return null;

  const knowledge = civ.knownCivs.get(other.id);
  const otherKnowledge = other.knownCivs.get(civ.id);
  if (!knowledge || !otherKnowledge) return null;

  const trust = 1 - knowledge.suspicionIndex;
  const otherTrust = 1 - otherKnowledge.suspicionIndex;
  if (trust < CONFIG.allianceMinTrust || otherTrust < CONFIG.allianceMinTrust) return null;

  // 双方都需要有合作倾向
  if (civ.strategy.cooperation < 0.3 || other.strategy.cooperation < 0.3) return null;

  // 概率建立联盟
  if (Math.random() > 0.05) return null;

  let alliance: Alliance;
  if (civ.allianceId) {
    alliance = alliances.find(a => a.id === civ.allianceId)!;
    if (alliance.members.length >= CONFIG.allianceMaxSize) return null;
    if (!alliance.members.includes(other.id)) alliance.members.push(other.id);
    other.allianceId = alliance.id;
  } else if (other.allianceId) {
    alliance = alliances.find(a => a.id === other.allianceId)!;
    if (alliance.members.length >= CONFIG.allianceMaxSize) return null;
    if (!alliance.members.includes(civ.id)) alliance.members.push(civ.id);
    civ.allianceId = alliance.id;
  } else {
    alliance = {
      id: `al_${(allianceIdCounter++).toString(36)}`,
      name: `${civ.name}-${other.name} 联盟`,
      members: [civ.id, other.id],
      formedAt: tick,
      trustLevel: (trust + otherTrust) / 2,
      techSharePool: 0,
      active: true,
    };
    alliances.push(alliance);
    civ.allianceId = alliance.id;
    other.allianceId = alliance.id;
  }

  return {
    tick, type: 'detection',
    sourceId: civ.id, sourceName: civ.name,
    targetId: other.id, targetName: other.name,
    detail: `🤝 ${civ.name} 与 ${other.name} 建立了联盟——脆弱的信任`,
  };
}

/** 每 tick 更新联盟 */
export function updateAlliances(
  alliances: Alliance[], civs: Civilization[], tick: number,
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const alliance of alliances) {
    if (!alliance.active) continue;

    // 科技共享
    const members = alliance.members.map(id => civs.find(c => c.id === id)).filter(Boolean) as Civilization[];
    if (members.length < 2) { alliance.active = false; continue; }

    // 计算科技池
    let totalTech = 0;
    for (const m of members) totalTech += getOverallTech(m.techTree);
    alliance.techSharePool = totalTech / members.length;

    // 科技扩散到成员
    for (const m of members) {
      for (const key of Object.keys(m.techTree) as (keyof typeof m.techTree)[]) {
        const avg = members.reduce((s, o) => s + o.techTree[key], 0) / members.length;
        if (avg > m.techTree[key]) {
          m.techTree[key] += (avg - m.techTree[key]) * CONFIG.allianceTechShareRate;
        }
      }
    }

    // 背刺检查
    for (const m of members) {
      const hawk = getHawkishness(m.politics);
      const betrayProb = CONFIG.allianceBetrayalBaseProb * (1 + hawk);
      if (Math.random() < betrayProb) {
        const victim = members.find(o => o.id !== m.id);
        if (victim) {
          alliance.active = false;
          m.allianceId = null; victim.allianceId = null;
          // 背刺后猜疑暴增
          const k1 = m.knownCivs.get(victim.id);
          if (k1) k1.suspicionIndex = 0.9;
          const k2 = victim.knownCivs.get(m.id);
          if (k2) k2.suspicionIndex = 0.9;
          events.push({
            tick, type: 'detection',
            sourceId: m.id, sourceName: m.name,
            targetId: victim.id, targetName: victim.name,
            detail: `🗡 ${m.name} 背刺了盟约——${alliance.name} 崩溃！`,
          });
        }
      }
    }
  }

  return events;
}

// ============================================================
// 科技传播 — 被动扩散
// ============================================================
export function applyTechDiffusion(civs: Civilization[], universe: import('./universe').Universe): void {
  if (!CONFIG.techDiffusionEnabled) return;
  const alive = civs.filter(c => c.alive && !c.inBlackDomain);

  for (const civ of alive) {
    for (const other of alive) {
      if (other.id === civ.id) continue;
      const dist = universe.distance(civ, other);
      if (dist > CONFIG.techDiffusionRange) continue;

      // 对方科技更高的领域 → 微弱学习
      for (const key of Object.keys(civ.techTree) as (keyof typeof civ.techTree)[]) {
        if (other.techTree[key] > civ.techTree[key]) {
          civ.techTree[key] += (other.techTree[key] - civ.techTree[key]) *
            CONFIG.techDiffusionRate * (1 - dist / CONFIG.techDiffusionRange);
        }
      }
    }
  }
}

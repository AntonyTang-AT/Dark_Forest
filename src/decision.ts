// ============================================================
// 黑暗森林模拟器 — 决策引擎 v4 (3D + 星际战争)
// ============================================================

import type {
  Civilization, Knowledge, ActionType, PendingAction,
  SimEvent, DualVectorZone,
} from './types';
import { CONFIG } from './config';
import { getOverallTech } from './tech_tree';
import {
  canPhotoidStrike, canDualVectorStrike, canBlackDomain, canAnyStrike,
  canCastSpell, enterBlackDomain, createWarState, tryCreateFugitive,
} from './civilization';
import { getHawkishness, getDovishness } from './politics';
import type { Universe } from './universe';

// ============================================================
// 探测
// ============================================================
export interface DetectionResult {
  detector: Civilization; detected: Civilization;
  distance: number; probability: number; success: boolean;
}

export function runDetectionPhase(
  civs: Civilization[], universe: Universe, detectionEfficiency: number,
): DetectionResult[] {
  const results: DetectionResult[] = [];
  const alive = civs.filter(c => c.alive && !c.inBlackDomain);
  for (const detector of alive) {
    if (detector.politics.stability < 0.1) continue;
    for (const target of alive) {
      if (target.id === detector.id) continue;
      const distance = universe.distance(detector, target);
      if (distance > detector.detectionRadius) continue;
      const signalFactor = Math.min(1, target.signalStrength / 3);
      const distanceFactor = Math.pow(Math.max(0, 1 - distance / detector.detectionRadius), CONFIG.detectionDistanceFalloff);
      const prob = CONFIG.detectionProbBase * signalFactor * distanceFactor *
        detectionEfficiency * (1 + detector.techTree.detection * 0.08);
      results.push({ detector, detected: target, distance, probability: prob, success: Math.random() < prob });
    }
  }
  return results;
}

// ============================================================
// 猜疑链
// ============================================================
export function computeSuspicionIndex(
  knowledge: Knowledge | undefined,
  myStrategy: { aggression: number; caution: number },
  estEnemyAgg: number, cognitionLevel: number, suspicionEnabled: boolean,
): number {
  if (!suspicionEnabled) return 0.08;
  let s = estEnemyAgg * 0.5 + myStrategy.aggression * 0.12 + myStrategy.caution * 0.12;
  if (knowledge && knowledge.observationHistory.length > 0) {
    const recent = knowledge.observationHistory.slice(-10);
    const hostile = recent.filter(a =>
      a.actionType === 'PHOTOID_STRIKE' || a.actionType === 'DUAL_VECTOR_FOIL' ||
      a.actionType === 'INTERSTELLAR_WAR'
    ).length;
    s += (hostile / Math.max(1, recent.length)) * CONFIG.suspicionHostileActionBump;
  }
  const maxDepth = Math.floor(cognitionLevel / 2);
  const actual = Math.min(maxDepth, CONFIG.suspicionDepthMax);
  for (let d = 0; d < actual; d++) {
    s = s + (1 - s) * CONFIG.suspicionBaseIncrement * (1 - d * 0.12);
  }
  return clamp(s, 0, 1);
}

export function estimateEnemyAggression(target: Civilization): number {
  const base = target.strategy.aggression;
  const hint = Math.min(1, target.signalStrength / 3);
  return clamp(base * 0.55 + hint * 0.45 + (Math.random() - 0.5) * 0.3, 0, 1);
}
export function estimateEnemyTech(target: Civilization): number {
  return getOverallTech(target.techTree) * (1 + (Math.random() - 0.5) * 0.35);
}

// ============================================================
// 干净清除评估
// ============================================================
export function assessCleanKill(
  attacker: Civilization, target: Civilization, knowledge: Knowledge,
): { canKill: boolean; confidence: number; reason: string } {
  if (target.inBlackDomain) return { canKill: false, confidence: 0, reason: '目标在黑域中' };
  if (knowledge.targetingProgress < 1.0) return { canKill: false, confidence: 0, reason: `锁定进度不足 (${(knowledge.targetingProgress * 100).toFixed(0)}%)` };
  if (canDualVectorStrike(attacker)) return { canKill: true, confidence: 0.98, reason: '二向箔——降维打击' };
  if (canPhotoidStrike(attacker)) {
    const adv = attacker.techTree.weapons - target.techTree.stealth;
    if (adv >= CONFIG.photoidCleanKillThreshold) return { canKill: true, confidence: clamp(0.7 + adv * 0.03, 0.7, 1.0), reason: `武器优势 +${adv.toFixed(0)}，光粒可行` };
    return { canKill: false, confidence: 0.3, reason: `武器优势不足 (+${adv.toFixed(0)} < +${CONFIG.photoidCleanKillThreshold})` };
  }
  return { canKill: false, confidence: 0, reason: '无黑暗森林打击能力' };
}

// ============================================================
// 星际战争检查
// ============================================================

/**
 * 检查两个文明是否应该爆发星际战争。
 * 条件：掌控范围重叠 + 技术水平相近 + 未处于战争 + 未在黑域
 */
function shouldDeclareWar(
  civ: Civilization, enemy: Civilization, knowledge: Knowledge,
): { shouldWar: boolean; reason: string } {
  if (!CONFIG.warEnabled) return { shouldWar: false, reason: '' };
  if (civ.warState || enemy.warState) return { shouldWar: false, reason: '' };
  if (civ.inBlackDomain || enemy.inBlackDomain) return { shouldWar: false, reason: '' };
  if (civ.pendingAction?.isDarkForestStrike) return { shouldWar: false, reason: '' };

  const dist = Math.sqrt((civ.x-enemy.x)**2 + (civ.y-enemy.y)**2 + (civ.z-enemy.z)**2);
  const overlapDist = civ.controlRadius + enemy.controlRadius;
  if (dist > overlapDist) return { shouldWar: false, reason: '' };

  const overlapRatio = 1 - dist / overlapDist;
  if (overlapRatio < CONFIG.warControlOverlapTrigger) return { shouldWar: false, reason: '' };

  // 技术差距不能太大
  const myTech = getOverallTech(civ.techTree);
  const enemyTech = getOverallTech(enemy.techTree);
  const techGap = Math.abs(myTech - enemyTech);
  if (techGap > CONFIG.warMaxTechGap) return { shouldWar: false, reason: '' };

  // 猜疑需要积累到一定程度
  if (knowledge.suspicionIndex < 0.35) return { shouldWar: false, reason: '' };

  // 攻击性文明更可能发动战争
  const hawkishness = getHawkishness(civ.politics);
  const warProb = 0.02 + hawkishness * 0.08 + knowledge.suspicionIndex * 0.06 + overlapRatio * 0.05;

  if (Math.random() < warProb) {
    return { shouldWar: true, reason: `掌控范围重叠 (${(overlapRatio*100).toFixed(0)}%)，技术相近，猜疑积累——爆发星际战争` };
  }
  return { shouldWar: false, reason: '' };
}

/**
 * 战争结算：每隔 N tick 判断一次战局。
 */
function resolveWarTick(
  civ: Civilization, enemy: Civilization, tick: number,
  universe: Universe, events: SimEvent[],
): void {
  if (!civ.warState || civ.warState.status !== 'active') return;
  if (civ.warState.lastResolutionAt + CONFIG.warResolutionTick > tick) return;

  civ.warState.lastResolutionAt = tick;

  // 计算双方战斗力
  const myPower = getOverallTech(civ.techTree) * 1.5 +
    civ.techTree.weapons * 2 +
    civ.population * 0.01 +
    civ.resources * 0.005;
  const enemyPower = getOverallTech(enemy.techTree) * 1.5 +
    enemy.techTree.weapons * 2 +
    enemy.population * 0.01 +
    enemy.resources * 0.005;

  const ratio = myPower / Math.max(1, enemyPower);

  // 战争疲劳影响
  const myEffPower = myPower * (1 - civ.warState.myExhaustion * 0.5);
  const enemyEffPower = enemyPower * (1 - civ.warState.enemyExhaustion * 0.5);
  const effRatio = myEffPower / Math.max(1, enemyEffPower);

  // 人口损失
  const myLosses = Math.floor(civ.population * (0.01 + Math.random() * 0.03) / Math.max(0.5, effRatio));
  const enemyLosses = Math.floor(enemy.population * (0.01 + Math.random() * 0.03) * Math.max(0.5, effRatio));
  civ.population = Math.max(1, civ.population - myLosses);
  enemy.population = Math.max(1, enemy.population - enemyLosses);
  civ.warState.totalMyLosses += myLosses;
  civ.warState.totalEnemyLosses += enemyLosses;

  // 判断战局走向
  const duration = tick - civ.warState.startedAt;

  if (effRatio > CONFIG.warConquerThreshold && duration > CONFIG.warDurationMin) {
    // 我方征服
    civ.warState.status = 'victory';
    if (enemy.warState) enemy.warState.status = 'defeat';
    enemy.alive = false; enemy.causeOfDeath = '星际战争败亡';
    absorbDefeatedCiv(civ, enemy);
    events.push({ tick, type: 'war_resolved', sourceId: civ.id, sourceName: civ.name,
      targetId: enemy.id, targetName: enemy.name,
      detail: `⚔️ ${civ.name} 在星际战争中征服了 ${enemy.name}` });
  } else if (effRatio < CONFIG.warStalemateThreshold && duration > CONFIG.warDurationMin * 2) {
    // 我方战败
    civ.warState.status = 'defeat';
    if (enemy.warState) enemy.warState.status = 'victory';
    civ.alive = false; civ.causeOfDeath = '星际战争败亡';
    absorbDefeatedCiv(enemy, civ);
    events.push({ tick, type: 'war_resolved', sourceId: enemy.id, sourceName: enemy.name,
      targetId: civ.id, targetName: civ.name,
      detail: `⚔️ ${enemy.name} 在星际战争中击败了 ${civ.name}` });
  } else if (duration > CONFIG.warDurationMax || (effRatio > 0.7 && effRatio < 1.4 && duration > CONFIG.warDurationMin * 3)) {
    // 僵持/停战
    civ.warState.status = 'stalemate';
    if (enemy.warState) enemy.warState.status = 'stalemate';
    events.push({ tick, type: 'war_resolved', sourceId: civ.id, sourceName: civ.name,
      targetId: enemy.id, targetName: enemy.name,
      detail: `🏳️ ${civ.name} 与 ${enemy.name} 的星际战争以僵持告终——双方暂时停火` });
  }

  // 如果一方死亡，发送死亡事件
  if (!civ.alive) {
    events.push({ tick, type: 'death', targetId: civ.id, targetName: civ.name,
      detail: `${civ.name} 在星际战争中灭亡` });
  }
  if (!enemy.alive) {
    events.push({ tick, type: 'death', targetId: enemy.id, targetName: enemy.name,
      detail: `${enemy.name} 在星际战争中灭亡` });
  }
}

// ============================================================
// 核心决策
// ============================================================
export function decideAction(
  civ: Civilization, knowledge: Knowledge, enemy: Civilization,
  suspicionEnabled: boolean,
): { actionType: ActionType; shouldStrike: boolean; reason: string } {
  if (civ.inBlackDomain) return { actionType: 'MONITOR', shouldStrike: false, reason: '' };
  if (civ.warState?.status === 'active') return { actionType: 'MONITOR', shouldStrike: false, reason: '' };

  const hawkishness = getHawkishness(civ.politics);
  const dovishness = getDovishness(civ.politics);

  const cleanKill = assessCleanKill(civ, enemy, knowledge);
  knowledge.suspicionIndex = computeSuspicionIndex(knowledge, civ.strategy,
    estimateEnemyAggression(enemy), civ.techTree.cognition, suspicionEnabled);

  // 【路径 W】检查是否触发星际战争
  const warCheck = shouldDeclareWar(civ, enemy, knowledge);
  if (warCheck.shouldWar) {
    return { actionType: 'INTERSTELLAR_WAR', shouldStrike: false, reason: warCheck.reason };
  }

  // 【路径 A】能干净清除 → 黑暗森林打击
  if (cleanKill.canKill && cleanKill.confidence > 0.7) {
    if (knowledge.suspicionIndex > 0.4 && civ.resources >= CONFIG.photoidResourceCost * 0.7 && hawkishness > 0.4) {
      if (canDualVectorStrike(civ) && civ.resources >= CONFIG.dualVectorResourceCost * 0.7 && knowledge.suspicionIndex > 0.7) {
        return { actionType: 'DUAL_VECTOR_FOIL', shouldStrike: true, reason: '猜疑不可逆，降维打击以绝后患' };
      }
      if (canPhotoidStrike(civ)) {
        return { actionType: 'PHOTOID_STRIKE', shouldStrike: true, reason: `猜疑 ${knowledge.suspicionIndex.toFixed(2)}，可确保清除` };
      }
    }
  }

  // 【路径 B】无力清除 + 致命威胁 → 黑域
  if (!cleanKill.canKill && canBlackDomain(civ)) {
    const extremeThreat = knowledge.suspicionIndex > 0.6 && enemy.techTree.weapons > civ.techTree.stealth;
    if ((extremeThreat || civ.politics.publicFear > 0.7) && dovishness > 0.3) {
      return { actionType: 'BLACK_DOMAIN', shouldStrike: false, reason: '威胁过大且无法反击——启动黑域' };
    }
  }

  // 【路径 C-2】咒语
  if (!cleanKill.canKill && knowledge.targetingProgress >= 1.0 && canCastSpell(civ)) {
    if ((knowledge.suspicionIndex > 0.5 || civ.politics.publicFear > 0.6) && Math.random() < 0.3) {
      return { actionType: 'SPELL', shouldStrike: false, reason: `广播 ${enemy.name} 的坐标` };
    }
  }

  // 【路径 C】不能清除 → 隐藏
  if (cleanKill.canKill && cleanKill.confidence < 0.7) {
    return { actionType: 'HIDE', shouldStrike: false, reason: `把握不足 (${(cleanKill.confidence*100).toFixed(0)}%)` };
  }

  if (!canAnyStrike(civ)) {
    if (canCastSpell(civ) && knowledge.targetingProgress >= 1.0 && knowledge.suspicionIndex > 0.6 && Math.random() < 0.15) {
      return { actionType: 'SPELL', shouldStrike: false, reason: '无力自保，广播坐标' };
    }
    return { actionType: 'HIDE', shouldStrike: false, reason: '无打击能力' };
  }

  if (knowledge.targetingProgress < 1.0) {
    return { actionType: 'MONITOR', shouldStrike: false, reason: `追踪中 (${(knowledge.targetingProgress*100).toFixed(0)}%)` };
  }

  if (civ.strategy.caution > 0.6) return { actionType: 'HIDE', shouldStrike: false, reason: '谨慎优先' };
  if (civ.strategy.cooperation > 0.6 && knowledge.suspicionIndex < 0.3 && Math.random() < 0.02) {
    return { actionType: 'BROADCAST', shouldStrike: false, reason: '极度危险的赌博——试图建立联系' };
  }

  return { actionType: 'HIDE', shouldStrike: false, reason: '默认谨慎' };
}

// ============================================================
// 行动执行
// ============================================================
export interface ExecutedAction {
  actor: Civilization; type: ActionType;
  targetId?: string; targetName?: string;
  success: boolean; detail: string;
}

export function executeActions(
  actions: ExecutedAction[], allCivs: Civilization[],
  universe: Universe, tick: number, dualVectorZones: DualVectorZone[],
): { events: SimEvent[]; newDualVectorZones: DualVectorZone[] } {
  const events: SimEvent[] = [];
  const newZones: DualVectorZone[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'PHOTOID_STRIKE': {
        const target = allCivs.find(c => c.id === action.targetId && c.alive);
        if (!target || target.inBlackDomain) continue;
        const a = action.actor;
        a.resources -= CONFIG.photoidResourceCost;
        a.strikeCooldown = 200; a.stealthActive = false;
        // 多殖民地文明：光粒摧毁一个殖民地（main.ts 处理），单殖民地直接灭亡
        if (target.colonies && target.colonies.length <= 1) {
          target.alive = false; target.causeOfDeath = '光粒打击';
        }
        events.push({ tick, type: 'death', sourceId: a.id, sourceName: a.name,
          targetId: target.id, targetName: target.name,
          detail: `☀️ ${a.name} 发动光粒打击，命中 ${target.name} 的恒星系统` });
        events.push({ tick, type: 'photoid_strike', sourceId: a.id, sourceName: a.name,
          targetId: target.id, targetName: target.name, detail: `光粒：${a.name} → ${target.name}` });
        exposeAttacker(a, allCivs, universe, tick, events);
        break;
      }
      case 'DUAL_VECTOR_FOIL': {
        const target = allCivs.find(c => c.id === action.targetId && c.alive);
        if (!target || target.inBlackDomain) continue;
        const a = action.actor;
        a.resources -= CONFIG.dualVectorResourceCost;
        a.strikeCooldown = 500; a.stealthActive = false;
        target.alive = false; target.causeOfDeath = '二向箔打击';
        const zone: DualVectorZone = {
          id: `dv_${tick}_${a.id}`, x: target.x, y: target.y, z: target.z,
          radius: CONFIG.dualVectorSpreadRadius,
          maxRadius: 99999, // 无实际上限，仅作性能保护
          spreadRate: CONFIG.dualVectorSpreadRate,
          createdAt: tick, createdBy: a.id,
        };
        newZones.push(zone);
        for (const civ of allCivs) {
          if (!civ.alive || civ.id === target.id || civ.inBlackDomain) continue;
          const dist = universe.distance(target, civ);
          if (dist < zone.radius) {
            civ.alive = false; civ.causeOfDeath = '二向箔波及';
            events.push({ tick, type: 'death', sourceId: a.id, sourceName: a.name,
              targetId: civ.id, targetName: civ.name,
              detail: `📐 ${civ.name} 被二向箔二维化波及` });
          }
        }
        events.push({ tick, type: 'death', sourceId: a.id, sourceName: a.name,
          targetId: target.id, targetName: target.name,
          detail: `📐 ${a.name} 投掷二向箔，${target.name} 被二维化——宇宙的永久伤痕` });
        events.push({ tick, type: 'dual_vector_foil', sourceId: a.id, sourceName: a.name,
          targetId: target.id, targetName: target.name,
          detail: `二向箔：${a.name} → ${target.name}` });
        exposeAttacker(a, allCivs, universe, tick, events);
        break;
      }
      case 'INTERSTELLAR_WAR': {
        const target = allCivs.find(c => c.id === action.targetId && c.alive);
        if (!target || target.inBlackDomain) continue;
        const a = action.actor;
        // 双方进入战争状态
        if (!a.warState) a.warState = createWarState(target.id, tick);
        if (!target.warState) target.warState = createWarState(a.id, tick);
        a.stealthActive = false;
        target.stealthActive = false;
        events.push({ tick, type: 'war_declared', sourceId: a.id, sourceName: a.name,
          targetId: target.id, targetName: target.name,
          detail: `⚔️ ${a.name} 与 ${target.name} 爆发星际战争！` });
        break;
      }
      case 'SPELL': {
        const target = allCivs.find(c => c.id === action.targetId && c.alive);
        if (!target || target.inBlackDomain) continue;
        const caster = action.actor;
        caster.resources -= CONFIG.spellResourceCost;
        caster.activeSpellTargetId = target.id;
        caster.stealthActive = false;
        events.push({ tick, type: 'spell', sourceId: caster.id, sourceName: caster.name,
          targetId: target.id, targetName: target.name,
          detail: `🪄 ${caster.name} 广播了 ${target.name} 的坐标——"咒语"已发出` });
        handleSpellResponse(caster, target, allCivs, universe, tick, events);
        break;
      }
      case 'BLACK_DOMAIN': {
        enterBlackDomain(action.actor, tick);
        events.push({ tick, type: 'black_domain', sourceId: action.actor.id, sourceName: action.actor.name,
          detail: `🌑 ${action.actor.name} 启动黑域——安全声明` });
        break;
      }
      case 'HIDE': action.actor.stealthActive = true; break;
      case 'BROADCAST':
        action.actor.stealthActive = false;
        events.push({ tick, type: 'broadcast', sourceId: action.actor.id, sourceName: action.actor.name,
          detail: `📡 ${action.actor.name} 广播了自身存在！` });
        break;
      case 'MONITOR': break;
    }
  }

  return { events, newDualVectorZones: newZones };
}

// ============================================================
// 咒语响应 & 暴露
// ============================================================
function handleSpellResponse(
  caster: Civilization, target: Civilization, allCivs: Civilization[],
  universe: Universe, tick: number, events: SimEvent[],
): void {
  for (const civ of allCivs) {
    if (!civ.alive || civ.inBlackDomain || civ.id === caster.id || civ.id === target.id) continue;
    if (universe.distance(caster, civ) > CONFIG.spellResponseRange) continue;
    if (civ.techTree.weapons < CONFIG.spellResponseWeaponThreshold) continue;
    if (Math.random() < CONFIG.spellResponseBaseProb && civ.resources >= CONFIG.photoidResourceCost * 0.5) {
      if (canPhotoidStrike(civ)) {
        civ.resources -= CONFIG.photoidResourceCost;
        civ.strikeCooldown = 200; civ.stealthActive = false;
        if (target.colonies && target.colonies.length <= 1) {
          target.alive = false; target.causeOfDeath = '光粒打击（咒语响应）';
        }
        events.push({ tick, type: 'death', sourceId: civ.id, sourceName: civ.name,
          targetId: target.id, targetName: target.name,
          detail: `☀️ ${civ.name} 响应咒语——光粒打击命中 ${target.name}` });
        events.push({ tick, type: 'photoid_strike', sourceId: civ.id, sourceName: civ.name,
          targetId: target.id, targetName: target.name, detail: `咒语响应：${civ.name} 代打 ${target.name}` });
        exposeAttacker(civ, allCivs, universe, tick, events);
        break;
      }
    }
  }
}

function exposeAttacker(
  attacker: Civilization, allCivs: Civilization[], universe: Universe,
  tick: number, events: SimEvent[],
): void {
  for (const civ of allCivs) {
    if (civ.id === attacker.id || !civ.alive || civ.inBlackDomain) continue;
    const dist = universe.distance(attacker, civ);
    const range = attacker.pendingAction?.type === 'DUAL_VECTOR_FOIL'
      ? CONFIG.dualVectorCollateralSignal : CONFIG.photoidCollateralSignal;
    if (dist < range && Math.random() < Math.max(0, 1 - dist / range)) {
      if (!civ.knownCivs.has(attacker.id)) {
        civ.knownCivs.set(attacker.id, {
          civId: attacker.id, discoveredAt: tick,
          estimatedTech: getOverallTech(attacker.techTree),
          estimatedIntent: 0.8, suspicionIndex: 0.6, suspicionDepth: 1,
          lastObservedAt: tick, observationCount: 1, targetingProgress: 0.2,
          observationHistory: [{
            tick, actionType: attacker.pendingAction?.type || 'PHOTOID_STRIKE',
            estimatedPower: getOverallTech(attacker.techTree),
          }],
        });
        events.push({ tick, type: 'detection', sourceId: civ.id, sourceName: civ.name,
          targetId: attacker.id, targetName: attacker.name,
          detail: `💥 ${civ.name} 通过打击信号发现了 ${attacker.name}` });
      }
    }
  }
}

// ============================================================
// 二向箔扩散
// ============================================================
export function spreadDualVectorZones(
  zones: DualVectorZone[], allCivs: Civilization[],
  universe: Universe, tick: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (const zone of zones) {
    // 扩散速度随时间衰减——永不停止，但越来越慢
    const age = tick - zone.createdAt;
    const decayFactor = Math.max(0.02, 1 / (1 + age * 0.002));
    zone.spreadRate = zone.spreadRate * 0.995; // 每 tick 减速 0.5%
    zone.radius += zone.spreadRate;
    // 移除上限检查，但超巨区域跳过（性能保护）
    if (zone.radius > 5000) continue;
    for (const civ of allCivs) {
      if (!civ.alive || civ.inBlackDomain) continue;
      const dist = universe.distance(zone as { x: number; y: number; z: number }, civ);
      if (dist < zone.radius && dist >= zone.radius - zone.spreadRate) {
        civ.alive = false; civ.causeOfDeath = '二向箔扩散';
        events.push({ tick, type: 'death', targetId: civ.id, targetName: civ.name,
          detail: `📐 ${civ.name} 被扩散的二维化空间吞没` });
      }
    }
  }
  return events;
}

// ============================================================
// 知识更新
// ============================================================
export function updateKnowledge(
  detector: Civilization, detected: Civilization,
  tick: number, suspicionEnabled: boolean,
): void {
  const estTech = estimateEnemyTech(detected);
  const estAgg = estimateEnemyAggression(detected);
  const existing = detector.knownCivs.get(detected.id);
  const suspIdx = computeSuspicionIndex(existing, detector.strategy, estAgg,
    detector.techTree.cognition, suspicionEnabled);
  const suspDepth = Math.min(CONFIG.suspicionDepthMax, Math.floor(detector.techTree.cognition / 2));
  const obsCount = (existing?.observationCount ?? 0) + 1;
  const trackProg = Math.min(1.0, (existing?.targetingProgress ?? 0) +
    CONFIG.detectionTrackingPerObservation * (1 + detector.techTree.detection * 0.02));
  detector.knownCivs.set(detected.id, {
    civId: detected.id, discoveredAt: existing?.discoveredAt ?? tick,
    estimatedTech: estTech, estimatedIntent: estAgg > 0.5 ? -0.5 : 0.2,
    suspicionIndex: suspIdx, suspicionDepth: suspDepth,
    lastObservedAt: tick, observationCount: obsCount,
    targetingProgress: trackProg,
    observationHistory: existing?.observationHistory ?? [],
  });
}

// ============================================================
// 主决策流程
// ============================================================
export interface DecisionPhaseResult {
  actions: ExecutedAction[]; events: SimEvent[];
  detectionResults: DetectionResult[]; newDualVectorZones: DualVectorZone[];
}

export function runDecisionPhase(
  civs: Civilization[], universe: Universe, tick: number,
  suspicionEnabled: boolean, detectionEfficiency: number,
  dualVectorZones: DualVectorZone[],
): DecisionPhaseResult {
  const events: SimEvent[] = [];
  const actions: ExecutedAction[] = [];
  let newZones: DualVectorZone[] = [];

  // 0. 二向箔扩散
  events.push(...spreadDualVectorZones(dualVectorZones, civs, universe, tick));

  // 1. 战争结算
  const alive = civs.filter(c => c.alive);
  for (const civ of alive) {
    if (civ.warState?.status === 'active') {
      const enemy = alive.find(c => c.id === civ.warState!.enemyId);
      if (!enemy || !enemy.alive) {
        civ.warState = null; continue;
      }
      resolveWarTick(civ, enemy, tick, universe, events);
    }
  }

  // 2. 探测
  const detectionResults = runDetectionPhase(civs, universe, detectionEfficiency);
  for (const det of detectionResults.filter(d => d.success)) {
    updateKnowledge(det.detector, det.detected, tick, suspicionEnabled);
    const knowledge = det.detector.knownCivs.get(det.detected.id)!;
    events.push({ tick, type: knowledge.targetingProgress >= 1.0 ? 'tracking' : 'detection',
      sourceId: det.detector.id, sourceName: det.detector.name,
      targetId: det.detected.id, targetName: det.detected.name,
      detail: knowledge.targetingProgress >= 1.0
        ? `🎯 ${det.detector.name} 完成对 ${det.detected.name} 的锁定`
        : `👁 ${det.detector.name} 探测到 ${det.detected.name}（${Math.round(det.distance)}单位，追踪${(knowledge.targetingProgress*100).toFixed(0)}%）` });
  }

  // 3. 决策
  const alive2 = civs.filter(c => c.alive);
  for (const civ of alive2) {
    if (civ.inBlackDomain || civ.warState?.status === 'active') continue;

    // 3a. 执行待定行动
    if (civ.pendingAction && tick >= civ.pendingAction.executeAt) {
      const pending = civ.pendingAction;
      civ.pendingAction = null;
      const target = alive2.find(c => c.id === pending.targetId);
      if (target && target.alive) {
        actions.push({ actor: civ, type: pending.type, targetId: pending.targetId, targetName: target.name, success: true, detail: '' });
      }
      continue;
    }
    if (civ.pendingAction) continue;

    // 3b. 对已知文明做决策
    let decided = false;
    for (const [enemyId, knowledge] of civ.knownCivs) {
      if (decided) break;
      const enemy = alive2.find(c => c.id === enemyId);
      if (!enemy) continue;

      const decision = decideAction(civ, knowledge, enemy, suspicionEnabled);

      if (decision.shouldStrike || decision.actionType === 'INTERSTELLAR_WAR') {
        const delay = civ.politics.decisionDelay;
        civ.pendingAction = {
          type: decision.actionType,
          targetId: enemy.id,
          decisionTick: tick,
          executeAt: tick + (decision.actionType === 'INTERSTELLAR_WAR' ? 1 : delay),
          isDarkForestStrike: decision.actionType === 'PHOTOID_STRIKE' || decision.actionType === 'DUAL_VECTOR_FOIL',
        };
        decided = true;
      } else if (decision.actionType === 'BLACK_DOMAIN') {
        civ.pendingAction = { type: 'BLACK_DOMAIN', decisionTick: tick,
          executeAt: tick + civ.politics.decisionDelay * 2, isDarkForestStrike: false };
        decided = true;
      } else if (decision.actionType === 'SPELL') {
        civ.pendingAction = { type: 'SPELL', targetId: enemy.id, decisionTick: tick,
          executeAt: tick + civ.politics.decisionDelay, isDarkForestStrike: false };
        decided = true;
      } else if (decision.actionType === 'HIDE' || decision.actionType === 'BROADCAST') {
        actions.push({ actor: civ, type: decision.actionType, success: true, detail: decision.reason });
      }
    }
  }

  // 4. 执行
  const exec = executeActions(actions, civs, universe, tick, dualVectorZones);
  events.push(...exec.events);
  newZones = exec.newDualVectorZones;

  return { actions, events, detectionResults, newDualVectorZones: newZones };
}

// ---- 工具 ----
import { absorbDefeatedCiv } from './civilization';
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

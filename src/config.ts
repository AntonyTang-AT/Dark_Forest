// ============================================================
// 黑暗森林模拟器 — 配置系统 v2
// Dark Forest Simulator — Configuration
//
// 原著概念映射：
//   光粒 (Photoid)         — 相对论性打击，摧毁恒星 → 需要武器≥30
//   二向箔 (Dual-Vector)   — 维度打击，永久摧毁空间 → 需要武器≥55
//   黑域 (Black Domain)    — 自囚于低光速区，安全声明 → 需要认知+隐匿≥40
//   猜疑链                   — 无法确定对方意图的递归推理困境
//   技术爆炸                 — 文明科技的非线性跃升
// ============================================================

import type { ScenarioPreset } from './types';

export const CONFIG = {
  // ==========================================
  // 宇宙空间（3D）
  // ==========================================
  universeSize: 4000,              // 各轴范围 [-size/2, size/2]
  minCivDistance: 250,             // 3D空间中的最小间距（更大）
  spaceDimension: 3,
  cameraMinDistance: 40,           // 最近缩放（可看清行星细节）
  cameraMaxDistance: 20000,        // 最远缩放
  cameraPanSpeed: 1.5,             // 键盘平移速度
  cameraRotateSpeed: 0.025,        // 键盘旋转速度

  // ==========================================
  // 星系系统
  // ==========================================
  starSystemCount: 600,            // 星系总数
  planetsPerSystemMin: 1,
  planetsPerSystemMax: 8,
  habitablePlanetRatio: 0.25,      // 宜居行星比例
  starDriftSpeed: 0.015,           // 星系漂移速度
  planetOrbitSpeedBase: 0.003,     // 行星基础轨道速度
  destroyedStarLifetime: 800,

  // ==========================================
  // 探测器系统
  // ==========================================
  probeEnabled: true,
  probeLaunchCost: 40,             // 发射探测器资源消耗
  probeSpeed: 0.5,                 // 探测器飞行速度
  probeDetectionRadius: 150,       // 探测器探测范围
  probeSignalStrength: 0.02,       // 探测器信号（极低——难以被反向追踪）
  probeMaxPerCiv: 5,               // 每文明最大探测器数
  probeCaptureProb: 0.05,          // 探测器被捕获的概率
  probeTracebackProb: 0.1,         // 捕获后反向追溯母星的概率

  // ==========================================
  // 联盟与外交
  // ==========================================
  allianceEnabled: true,
  allianceMinTrust: 0.7,           // 形成联盟的最低信任度 (1-suspicionIndex)
  allianceTechShareRate: 0.03,     // 联盟内科技共享速率/tick
  allianceDefenseBonus: 0.2,       // 联盟防御加成
  allianceBetrayalBaseProb: 0.002, // 每 tick 背刺基础概率
  allianceMaxSize: 5,              // 最大联盟规模

  // ==========================================
  // 科技传播
  // ==========================================
  techDiffusionEnabled: true,
  techDiffusionRange: 400,         // 科技扩散范围
  techDiffusionRate: 0.003,        // 基础扩散速率/tick
  techDiffusionSalvageRate: 0.05,  // 从残骸中被动学习速率

  // ==========================================
  // 恒星生命周期
  // ==========================================
  starLifecycleEnabled: true,
  starAgingRate: 0.0002,           // 恒星老化速率/tick
  supernovaProbPerTick: 0.0001,    // 超新星爆发概率（降低）
  supernovaRadius: 200,            // 超新星杀伤半径（缩小）
  redGiantExpansionRate: 0.02,     // 红巨星膨胀速率

  // ==========================================
  // 文明分裂
  // ==========================================
  civilWarEnabled: true,
  civilWarStabilityThreshold: 0.08, // 稳定度低于此可能分裂
  civilWarProbPerTick: 0.005,       // 每 tick 分裂概率
  splitTechRetention: 0.8,          // 分裂后科技保留率
  splitDistance: 80,                // 分裂后双方距离

  // ==========================================
  // 宇宙灾难
  // ==========================================
  disasterEnabled: true,
  disasterProbPerTick: 0.00002,     // 宇宙灾难基础概率（大幅降低）
  grbRadius: 250,                   // 伽马射线暴杀伤半径（缩小）
  grbDuration: 30,                  // 持续 tick 数（缩短）

  // ==========================================
  // 文明诞生时间分布
  // ==========================================
  defaultCivCount: 150,
  // 文明不是同时诞生的——有的极其古老，有的刚刚萌芽
  civBirthSpan: 3000,             // 文明诞生的时间跨度（tick）
  ancientCivRatio: 0.08,          // "古老文明"占比——诞生在最早 8% 时段
  elderCivRatio: 0.17,            // "长者文明"占比——诞生在 8%-25% 时段
  matureCivRatio: 0.35,           // "成熟文明"占比——诞生在 25%-60% 时段
  youngCivRatio: 0.40,            // "年轻文明"占比——诞生在 60%-100% 时段
  ancientTechBonus: 25,           // 古老文明的初始科技加成（已发展很久）
  elderTechBonus: 12,
  matureTechBonus: 4,
  youngTechBonus: 0,

  // ==========================================
  // 文明初始状态（针对"年轻文明"的基准值）
  // ==========================================
  initialPopulation: 60,
  initialResources: 400,
  initialTechBase: 4,
  initialTechVariance: 3,

  // ==========================================
  // 资源系统
  // ==========================================
  resourceAbundance: 0.6,
  resourceRegenRate: 0.015,
  resourceConsumePerPop: 0.005,
  resourceMaxPerCell: 120,

  // ==========================================
  // 人口系统
  // ==========================================
  popGrowthBase: 0.003,
  popGrowthResourceFactor: 0.4,
  popOvercrowdThreshold: 800,
  popOvercrowdPenalty: 0.3,

  // ==========================================
  // 科技系统
  // ==========================================
  techGrowthBase: 0.008,             // 基础科技增长（更慢）
  techBreakthroughBaseProb: 0.0004,  // 基础技术爆炸概率
  techBreakthroughPressureMult: 5.0,
  techBreakthroughMinMagnitude: 8,
  techBreakthroughMaxMagnitude: 30,
  techBreakthroughCooldown: 350,
  salvageTechBonus: 0.2,

  // ==========================================
  // 信号系统
  // ==========================================
  signalBaseStrength: 0.1,
  signalPopFactor: 0.0004,
  signalTechFactor: 0.025,
  signalExpansionFactor: 0.04,
  signalHidingReduction: 0.12,
  signalPhotoidBurst: 8.0,          // 光粒打击的信号暴增
  signalDualVectorBurst: 15.0,      // 二向箔的信号暴增（宇宙尺度的尖叫）
  signalBroadcastBurst: 25.0,

  // ==========================================
  // 探测系统
  // ==========================================
  detectionBaseRange: 200,
  detectionTechMultiplier: 8,
  detectionProbBase: 0.12,
  detectionDistanceFalloff: 2.8,
  detectionMinSignalsToTrack: 4,     // 需要至少 4 次观测才能建立追踪
  detectionTrackingPerObservation: 0.25, // 每次成功观测增加的追踪进度

  // ==========================================
  // 光粒打击 (Photoid Strike)
  //   文明的"标准"黑暗森林打击手段
  //   加速质量点至近光速，击穿恒星
  // ==========================================
  photoidWeaponThreshold: 30,        // 武器科技门槛
  photoidResourceCost: 600,          // 资源消耗
  photoidCleanKillThreshold: 10,     // 我方武器-对方隐匿 > 此值 → 确保清除
  photoidRangeMultiplier: 2.5,       // 打击距离 = 探测距离 * 此倍率
  photoidCollateralSignal: 500,      // 打击信号暴露范围

  // ==========================================
  // 二向箔 (Dual-Vector Foil)
  //   终极武器——将三维空间二维化
  //   只有最顶级的文明才能使用
  //   一经使用，二维化区域永久存在且持续扩散
  // ==========================================
  dualVectorWeaponThreshold: 55,     // 极高的武器科技门槛
  dualVectorResourceCost: 2500,      // 天文数字的资源消耗
  dualVectorRangeMultiplier: 3.0,    // 打击范围更广
  dualVectorCollateralSignal: 1000,  // 全宇宙都能"听到"
  dualVectorSpreadRadius: 80,        // 二维化区域初始半径
  dualVectorSpreadRate: 0.3,         // 每 tick 扩散速度
  dualVectorSpreadMaxRadius: 600,    // 最大扩散半径

  // ==========================================
  // 黑域 (Black Domain)
  //   文明的自囚策略——将自身恒星系的光速降低
  //   效果：无法扩张、无法被打击、信号归零
  //   代价：永远困在自己的星系里，缓慢消亡
  //   这是"安全声明"——证明自己不再是威胁
  // ==========================================
  blackDomainCognitionThreshold: 25,   // 认知科技门槛
  blackDomainStealthThreshold: 25,     // 隐匿科技门槛
  blackDomainResourceCost: 800,        // 资源消耗
  blackDomainPopGrowthPenalty: -0.002, // 进入黑域后人口增长变为负值
  blackDomainTechGrowthPenalty: 0.1,   // 科技增长变为原来的 10%
  blackDomainSignalMultiplier: 0.01,

  // ==========================================
  // 掌控范围与探测范围
  //   — 掌控范围 = 文明实际控制的领土（资源开采）
  //   — 探测范围 = 文明能"看到"的距离（远大于掌控范围）
  // ==========================================
  controlRadiusBase: 30,
  controlRadiusPopFactor: 0.03,
  controlRadiusTechFactor: 0.4,
  detectionRangeBase: 200,
  detectionRangeTechFactor: 8,

  // ==========================================
  // 迁徙与移动 — 文明向资源丰富区移动
  // ==========================================
  migrationSpeedBase: 0.04,
  migrationResourceAttraction: 0.5,
  migrationThreatRepulsion: 0.8,
  migrationRandomFactor: 0.3,
  migrationSpeedByGeneration: {
    'ancient': 0.3, 'elder': 0.5, 'mature': 0.8, 'young': 1.2,
  } as Record<string, number>,

  // ==========================================
  // 咒语系统 — 广播目标坐标，借刀杀人
  // ==========================================
  spellEnabled: true,
  spellSignalBurst: 15.0,
  spellResourceCost: 300,
  spellResponseBaseProb: 0.03,
  spellResponseRange: 1500,
  spellResponseWeaponThreshold: 35,

  // ==========================================
  // 逃亡者系统 — 打击下的幸存者
  // ==========================================
  fugitiveEnabled: true,
  fugitiveBaseProb: 0.15,
  fugitiveTechRetention: 0.7,
  fugitivePopRetention: 0.15,
  fugitiveResourceRetention: 0.2,
  fugitiveDistance: 500,
  fugitiveStealthBonus: 5,
  fugitiveCautionBonus: 0.3,
  fugitiveMaxPerCiv: 2,

  // ==========================================
  // 星际战争 — 技术相近的邻近文明间的常规冲突
  //   与黑暗森林打击不同：这是持久战，而非一击必杀
  //   爆发条件：掌控范围重叠 + 技术差距不大 + 猜疑积累
  // ==========================================
  warEnabled: true,
  warControlOverlapTrigger: 0.3,   // 掌控范围重叠达到此比例即可触发战争
  warMaxTechGap: 15,               // 总体科技差距超过此值则不会爆发常规战争（一方碾压）
  warResourceDrainPerTick: 15,     // 战争每 tick 资源消耗
  warDurationMin: 20,              // 最短战争持续 tick
  warDurationMax: 150,             // 最长战争持续 tick
  warResolutionTick: 30,           // 每隔 N tick 判定一次战局
  warConquerThreshold: 2.0,        // 力量比 > 此值 → 征服
  warStalemateThreshold: 0.7,      // 力量比在 [stalemate, conquer] → 僵持
  warSignalBurst: 3.0,             // 战争增加的信号倍数
  warExhaustionRate: 0.03,         // 每 tick 战争疲劳积累
  warFugitiveProb: 0.08,           // 战败方产生逃亡者的概率

  // ==========================================
  // 猜疑链
  // ==========================================
  suspicionDepthMax: 5,
  suspicionBaseIncrement: 0.12,
  suspicionDecayRate: 0.002,
  suspicionHostileActionBump: 0.3,

  // ==========================================
  // 内部政治
  // ==========================================
  fearFromDetection: 0.06,
  fearFromStrike: 0.5,
  fearDecayRate: 0.006,
  stabilityFearThreshold: 0.6,
  stabilityCollapseThreshold: 0.12,
  factionPowerShiftRate: 0.015,

  // ==========================================
  // 决策延迟
  // ==========================================
  decisionDelayByGovernment: {
    'hive_mind': 1,
    'authoritarian': 5,
    'oligarchy': 8,
    'democracy': 15,
    'anarchy': 20,
  } as Record<string, number>,

  // ==========================================
  // 扩张
  // ==========================================
  expansionSpeedBase: 0.06,
  expansionPropulsionFactor: 0.025,
  expansionResourceCost: 10,

  // ==========================================
  // 模拟速度
  // ==========================================
  ticksPerSecond: 10,
  maxSpeed: 10,
  minSpeed: 0.25,
};

// ============================================================
// 预设场景
// ============================================================
export const SCENARIOS: Record<string, ScenarioPreset> = {
  default: {
    name: '默认宇宙',
    description: '空旷宇宙，文明发展有先后，高技术门槛黑暗森林打击',
    civCount: 120,
    resourceAbundance: 0.6,
    detectionEfficiency: 0.4,
    universeSize: 4000,
    suspicionEnabled: true,
    techBreakthroughRate: 1.0,
  },
  sparse: {
    name: '稀疏宇宙',
    description: '极低密度——文明极少相遇，更接近真实宇宙',
    civCount: 30,
    resourceAbundance: 0.6,
    detectionEfficiency: 0.4,
    universeSize: 5000,
    suspicionEnabled: true,
    techBreakthroughRate: 1.0,
  },
  crowded: {
    name: '拥挤星团',
    description: '高密度区域——但打击门槛和资源限制依然存在',
    civCount: 200,
    resourceAbundance: 0.35,
    detectionEfficiency: 0.4,
    universeSize: 2500,
    suspicionEnabled: true,
    techBreakthroughRate: 1.2,
  },
  abundant: {
    name: '丰饶之地',
    description: '资源充足——没有生存压力时，合作是否可能？',
    civCount: 120,
    resourceAbundance: 0.9,
    detectionEfficiency: 0.4,
    universeSize: 4000,
    suspicionEnabled: true,
    techBreakthroughRate: 0.6,
  },
  scarce: {
    name: '贫瘠之地',
    description: '资源极度紧缺——生存压力下，黑暗森林加速降临',
    civCount: 120,
    resourceAbundance: 0.18,
    detectionEfficiency: 0.4,
    universeSize: 4000,
    suspicionEnabled: true,
    techBreakthroughRate: 2.0,
  },
  no_suspicion: {
    name: '无猜疑链（对照）',
    description: '关闭猜疑链——其他条件不变，验证猜疑链是否关键变量',
    civCount: 120,
    resourceAbundance: 0.6,
    detectionEfficiency: 0.4,
    universeSize: 4000,
    suspicionEnabled: false,
    techBreakthroughRate: 1.0,
  },
  early_universe: {
    name: '早期宇宙',
    description: '几乎所有文明都还很年轻——没人有打击能力，观察初始演化',
    civCount: 150,
    resourceAbundance: 0.7,
    detectionEfficiency: 0.35,
    universeSize: 4000,
    suspicionEnabled: true,
    techBreakthroughRate: 0.3,
  },
  ancient_galaxy: {
    name: '古老星系',
    description: '存在多个远古文明——它们已经发展了数千年，拥有毁灭性力量',
    civCount: 80,
    resourceAbundance: 0.5,
    detectionEfficiency: 0.5,
    universeSize: 4000,
    suspicionEnabled: true,
    techBreakthroughRate: 1.5,
  },
};

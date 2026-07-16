// ============================================================
// 黑暗森林模拟器 — 类型定义 v2
// ============================================================

// ---- 空间坐标（3D） ----
export interface Point {
  x: number;
  y: number;
  z: number;
}

// ---- 恒星类型 ----
export type StarType = 'red_dwarf' | 'yellow_dwarf' | 'blue_giant' | 'white_dwarf' | 'neutron' | 'black_hole';

// ---- 恒星生命阶段 ----
export type StarStage = 'main_sequence' | 'red_giant' | 'supernova' | 'white_dwarf' | 'neutron' | 'black_hole';

// ---- 殖民地 ----
export interface Colony {
  id: string;
  systemId: string;
  planetId: string;
  population: number;
  resources: number;
  isCapital: boolean;
  foundedAt: number;
}

// ---- 行星（开普勒轨道） ----
export interface Planet {
  id: string;
  name: string;
  // 轨道元素
  semiMajorAxis: number;      // 半长轴
  eccentricity: number;       // 离心率 0-0.9
  inclination: number;        // 轨道倾角 (rad)
  longitudeOfAscendingNode: number; // 升交点经度
  argumentOfPeriapsis: number;      // 近星点幅角
  meanAnomalyAtEpoch: number;       // 初始平近点角
  orbitalPeriod: number;            // 轨道周期 (tick)
  // 物理属性
  size: number;
  habitability: number;
  occupied: boolean;
  occupantCivId: string | null;
}

// ---- 星系 ----
export interface StarSystem {
  id: string;
  name: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;  // 星系漂移速度
  starType: StarType;
  starSize: number;          // 恒星大小
  starColor: string;         // 渲染颜色
  planets: Planet[];
  destroyed: boolean;
  destroyedAt: number;
  destroyCause: string | null;
  inBlackDomain: boolean;
  inDualVectorZone: boolean;
  // 恒星生命周期
  age: number;               // 恒星年龄 (tick)
  stage: StarStage;          // 当前生命阶段
  maxAge: number;            // 最大寿命
}

// ---- 探测器 ----
export interface Probe {
  id: string;
  ownerId: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  detectionRadius: number;
  signalStrength: number;
  launchedAt: number;
  alive: boolean;
  captured: boolean;
  capturedById: string | null;
}

// ---- 联盟 ----
export interface Alliance {
  id: string;
  name: string;
  members: string[];           // 成员文明 ID
  formedAt: number;
  trustLevel: number;          // 0-1 内部信任度
  techSharePool: number;       // 共享科技池
  active: boolean;
}

// ---- 宇宙灾难 ----
export interface CosmicDisaster {
  id: string;
  type: 'gamma_ray_burst' | 'supernova_shockwave';
  x: number; y: number; z: number;
  radius: number;
  maxRadius: number;
  expansionRate: number;
  startedAt: number;
  duration: number;
  active: boolean;
}

// ---- 文明世代 ----
export type CivGeneration = 'ancient' | 'elder' | 'mature' | 'young';

// ---- 策略人格向量 ----
export interface Strategy {
  aggression: number;    // 0-1
  caution: number;       // 0-1
  cooperation: number;   // 0-1
  expansionism: number;  // 0-1
}

// ---- 政府类型 ----
export type GovernmentType =
  | 'democracy'
  | 'authoritarian'
  | 'hive_mind'
  | 'oligarchy'
  | 'anarchy';

// ---- 内部派系 ----
export interface Faction {
  name: string;
  power: number;
  attitude: 'hawk' | 'dove' | 'isolationist' | 'expansionist';
}

// ---- 内部政治 ----
export interface Politics {
  governmentType: GovernmentType;
  stability: number;
  factions: Faction[];
  decisionDelay: number;
  publicFear: number;
}

// ---- 科技树 ----
export interface TechTree {
  detection: number;
  stealth: number;
  weapons: number;
  propulsion: number;
  communication: number;
  cognition: number;
  economics: number;
}

// ---- 科技爆炸事件 ----
export interface TechBreakthrough {
  field: keyof TechTree;
  magnitude: number;
  trigger: 'random' | 'pressure' | 'salvage' | 'observation' | 'fear';
  tick: number;
}

// ---- 文明行动类型 ----
// PHOTOID_STRIKE:  光粒打击——标准黑暗森林打击，摧毁恒星
// DUAL_VECTOR_FOIL: 二向箔——维度打击，永久摧毁空间
// BLACK_DOMAIN:     黑域——自囚于低光速区，发出"安全声明"
// MONITOR:          继续观察
// HIDE:             降低信号，进入隐蔽状态
// BROADCAST:        向宇宙广播自身存在
// INTERSTELLAR_WAR:  星际战争——技术相近的邻近文明间的常规军事冲突
// SPELL:            广播目标坐标——借刀杀人
export type ActionType =
  | 'PHOTOID_STRIKE'
  | 'DUAL_VECTOR_FOIL'
  | 'BLACK_DOMAIN'
  | 'INTERSTELLAR_WAR'
  | 'SPELL'
  | 'MONITOR'
  | 'HIDE'
  | 'BROADCAST';

// ---- 观察到的行动 ----
export interface ObservedAction {
  tick: number;
  actionType: ActionType;
  targetId?: string;
  estimatedPower: number;
}

// ---- 对其他文明的认知与追踪 ----
export interface Knowledge {
  civId: string;
  discoveredAt: number;
  estimatedTech: number;
  estimatedIntent: number;
  suspicionIndex: number;
  suspicionDepth: number;
  lastObservedAt: number;
  observationCount: number;
  targetingProgress: number;      // 0-1，到达 1.0 可以发动光粒打击
  observationHistory: ObservedAction[];
}

// ---- 文明完整状态 ----
export interface Civilization {
  id: string;
  name: string;
  generation: CivGeneration;       // 世代
  // 空间（3D）——基于首都殖民地
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  radius: number;
  controlRadius: number;
  detectionRadius: number;
  // 多星系殖民
  colonies: Colony[];
  // 基础（所有殖民地汇总）
  population: number;
  resources: number;
  // 信号
  signalStrength: number;
  stealthActive: boolean;
  // 黑域
  inBlackDomain: boolean;
  enteredBlackDomainAt: number;
  // 逃亡者
  isFugitive: boolean;
  fugitiveOriginId: string | null;
  fugitiveCount: number;           // 该文明产生的逃亡者数量（限制最大数）
  // 咒语
  activeSpellTargetId: string | null;
  // 联盟
  allianceId: string | null;
  // 探测器
  probeCount: number;
  // 母星
  homeStarX: number; homeStarY: number; homeStarZ: number;
  // 战争
  warState: WarState | null;       // 当前战争状态（null = 未处于战争中）
  // 策略
  strategy: Strategy;
  // 子系统
  politics: Politics;
  techTree: TechTree;
  // 认知
  knownCivs: Map<string, Knowledge>;
  // 待执行行动
  pendingAction: PendingAction | null;
  // 状态
  alive: boolean;
  causeOfDeath: string | null;
  birthTick: number;
  color: string;
  // 冷却
  breakthroughCooldown: number;
  strikeCooldown: number;          // 打击冷却（不能连续打击）
}

// ---- 待执行行动 ----
export interface PendingAction {
  type: ActionType;
  targetId?: string;
  decisionTick: number;
  executeAt: number;
  isDarkForestStrike: boolean;
}

// ---- 星际战争状态 ----
export interface WarState {
  enemyId: string;
  startedAt: number;           // 战争开始的 tick
  lastResolutionAt: number;    // 上次判定 tick
  myExhaustion: number;        // 己方战争疲劳 0-1
  enemyExhaustion: number;     // 估计敌方战争疲劳
  totalMyLosses: number;       // 己方累计损失
  totalEnemyLosses: number;    // 估计敌方累计损失
  status: 'active' | 'stalemate' | 'victory' | 'defeat';
}

// ---- 二向箔区域（永久改变宇宙结构） ----
export interface DualVectorZone {
  id: string;
  x: number; y: number; z: number;
  radius: number;
  maxRadius: number;
  spreadRate: number;
  createdAt: number;
  createdBy: string;
}

// ---- 模拟事件 ----
export interface SimEvent {
  tick: number;
  type:
    | 'detection'
    | 'tracking'
    | 'photoid_strike'
    | 'dual_vector_foil'
    | 'black_domain'
    | 'spell'
    | 'fugitive'
    | 'war_declared'
    | 'war_resolved'
    | 'death'
    | 'birth'
    | 'broadcast'
    | 'breakthrough'
    | 'hiding';
  sourceId?: string;
  sourceName?: string;
  targetId?: string;
  targetName?: string;
  detail?: string;
}

// ---- 模拟统计数据 ----
export interface SimulationStats {
  tick: number;
  aliveCount: number;
  totalDeaths: number;
  totalPhotoidStrikes: number;
  totalDualVectorStrikes: number;
  totalBlackDomains: number;
  totalDetections: number;
  avgTechLevel: number;
  deathsByCause: Record<string, number>;
  strategyDistribution: Record<string, number>;
  avgSuspicionIndex: number;
  civsInBlackDomain: number;
}

// ---- 预设场景配置 ----
export interface ScenarioPreset {
  name: string;
  description: string;
  civCount: number;
  resourceAbundance: number;
  detectionEfficiency: number;
  universeSize: number;
  suspicionEnabled: boolean;
  techBreakthroughRate: number;
}

// ---- 渲染用的文明概要 ----
export interface CivRenderData {
  id: string;
  x: number; y: number; z: number;
  radius: number;
  controlRadius: number;
  detectionRadius: number;
  color: string;
  signalStrength: number;
  alive: boolean;
  isHiding: boolean;
  isBreakthrough: boolean;
  inBlackDomain: boolean;
  isFugitive: boolean;
  atWar: boolean;
  hasActiveSpell: boolean;
  canPhotoidStrike: boolean;
  canDualVectorStrike: boolean;
  generation: CivGeneration;
  strategy: Strategy;
  techLevel: number;
  weaponLevel: number;
  name: string;
  population: number;
  causeOfDeath: string | null;
  homeStarX: number; homeStarY: number; homeStarZ: number;
  homeSystemId: string | null;
  colonyPositions: Array<{ x: number; y: number; z: number; isCapital: boolean }>;
}

// ---- 恒星系渲染数据（用于双击查看） ----
export interface StarRenderData {
  id: string;
  name: string;
  x: number; y: number; z: number;
  starType: StarType;
  destroyed: boolean;
  destroyCause: string | null;
  destroyedAt: number;
  inBlackDomain: boolean;
  inDualVectorZone: boolean;
  starSize: number;
  starColor: string;
  planetCount: number;
  occupiedPlanetCount: number;
}

// ---- 渲染用的连线 ----
export interface RenderLink {
  fromX: number; fromY: number; fromZ: number;
  toX: number; toY: number; toZ: number;
  type: 'tracking' | 'photoid' | 'dual_vector' | 'spell' | 'war';
  alpha: number;
  progress: number;
}

// ---- 渲染用的二向箔区域 ----
export interface DualVectorRenderData {
  id: string;
  x: number; y: number; z: number;
  radius: number;
  alpha: number;
}

// ---- 文明名称生成池 ----
export const CIV_NAME_PREFIXES = [
  '星海', '深空', '曙光', '暮光', '苍蓝', '赤红', '暗影', '辉光',
  '天穹', '渊海', '极光', '虚空', '黎明', '黄昏', '银翼', '金瞳',
  '翡翠', '黑曜', '紫晶', '碧落', '幽玄', '浩瀚', '永恒', '刹那',
];

export const CIV_NAME_SUFFIXES = [
  '帝国', '联邦', '共和国', '联盟', '共同体', '集合体', '文明',
  '王朝', '议会', '部落', '集群', '网络', '秩序', '教廷', '公会',
];

// 古老文明有更古风的名字
export const ANCIENT_NAME_PREFIXES = [
  '太初', '鸿蒙', '混沌', '远古', '原初', '太古', '洪荒', '始源',
  '永恒', '无极', '开元', '初代', '元始', '亘古', '冥古', '宙始',
];

// ---- 默认派系模板 ----
export const DEFAULT_FACTIONS: Record<string, Faction[]> = {
  democracy: [
    { name: '防御派', power: 0.35, attitude: 'dove' },
    { name: '进取派', power: 0.35, attitude: 'hawk' },
    { name: '孤立派', power: 0.30, attitude: 'isolationist' },
  ],
  authoritarian: [
    { name: '军事委员会', power: 0.60, attitude: 'hawk' },
    { name: '科学院', power: 0.25, attitude: 'expansionist' },
    { name: '外交署', power: 0.15, attitude: 'dove' },
  ],
  hive_mind: [
    { name: '集体意志', power: 1.0, attitude: 'hawk' },
  ],
  oligarchy: [
    { name: '军工集团', power: 0.40, attitude: 'hawk' },
    { name: '商贸联盟', power: 0.35, attitude: 'expansionist' },
    { name: '学术理事会', power: 0.25, attitude: 'dove' },
  ],
  anarchy: [
    { name: '军阀派系', power: 0.40, attitude: 'hawk' },
    { name: '自由邦联', power: 0.30, attitude: 'isolationist' },
    { name: '互助网络', power: 0.30, attitude: 'dove' },
  ],
};

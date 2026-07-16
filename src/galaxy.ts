// ============================================================
// 星系生成器 v2 — 开普勒椭圆轨道
// ============================================================

import type { StarSystem, Planet, StarType } from './types';
import { CONFIG } from './config';
import { REAL_STARS } from './star_catalog';

// ---- 真实天文参数 ----
// 恒星半径 (R☉), 质量 (M☉), 表面温度 (K)
interface StarSpec { radiusRange: [number, number]; massRange: [number, number]; temp: number; color: string; }
const STAR_SPECS: Record<StarType, StarSpec> = {
  red_dwarf:    { radiusRange: [0.15, 0.55], massRange: [0.1, 0.5],  temp: 3200,  color: '#ff9966' },
  yellow_dwarf: { radiusRange: [0.85, 1.15], massRange: [0.8, 1.2],  temp: 5770,  color: '#fff8e7' },
  blue_giant:   { radiusRange: [6, 18],      massRange: [10, 40],    temp: 22000, color: '#aaccff' },
  white_dwarf:  { radiusRange: [0.008, 0.02],massRange: [0.5, 1.2],  temp: 12000, color: '#eeeeff' },
  neutron:      { radiusRange: [0.00003, 0.00005], massRange: [1.4, 2.5], temp: 1000000, color: '#ccddff' },
  black_hole:   { radiusRange: [0.00001, 0.0001], massRange: [3, 50], temp: 0, color: '#110011' },
};

// 行星大小范围（地球半径 R🜨）
const PLANET_SIZE_RANGES: Array<{ prob: number; range: [number, number]; label: string }> = [
  { prob: 0.40, range: [0.3, 1.5], label: '岩石行星' },   // 类地行星
  { prob: 0.25, range: [1.5, 4.0], label: '超级地球' },   // 超级地球
  { prob: 0.20, range: [4.0, 9.0], label: '冰巨行星' },   // 海王星类
  { prob: 0.15, range: [9.0, 16.0], label: '气态巨行星' }, // 木星类
];
const PLANET_NAMES = ['水', '金', '地', '火', '木', '土', '天', '海', '冥', '谷', '灵', '玄', '赤', '苍', '白', '翠', '炎', '冰'];

let sid = 0, pid = 0;
function nsid(): string { return `sys_${(sid++).toString(36).padStart(3, '0')}`; }
function npid(): string { return `pl_${(pid++).toString(36).padStart(4, '0')}`; }
export function resetGalaxyCounters(): void { sid = 0; pid = 0; usedStarNames.clear(); }

function pickStarType(distNorm: number): StarType {
  const r = Math.random();
  if (distNorm < 0.15) {
    if (r < 0.2) return 'blue_giant'; if (r < 0.35) return 'black_hole';
    if (r < 0.5) return 'neutron'; if (r < 0.75) return 'yellow_dwarf'; return 'red_dwarf';
  } else if (distNorm < 0.5) {
    if (r < 0.05) return 'blue_giant'; if (r < 0.1) return 'neutron';
    if (r < 0.45) return 'yellow_dwarf'; if (r < 0.7) return 'red_dwarf'; return 'white_dwarf';
  } else {
    if (r < 0.02) return 'neutron'; if (r < 0.15) return 'yellow_dwarf';
    if (r < 0.55) return 'red_dwarf'; return 'white_dwarf';
  }
}

// ============================================================
// 开普勒轨道：平近点角 → 真近点角
// ============================================================
function solveKepler(M: number, e: number, tolerance: number = 1e-6): number {
  // 牛顿法解 M = E - e*sin(E)
  let E = M; // 初始猜测
  for (let i = 0; i < 10; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}

function trueAnomaly(E: number, e: number): number {
  // tan(ν/2) = sqrt((1+e)/(1-e)) * tan(E/2)
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );
}

/** 计算行星在3D空间中的位置（开普勒轨道，基于当前 tick） */
export function getPlanetPosition(sys: StarSystem, planet: Planet, tick: number): { x: number; y: number; z: number } {
  const a = planet.semiMajorAxis;
  const e = planet.eccentricity;
  const i = planet.inclination;
  const Omega = planet.longitudeOfAscendingNode;
  const omega = planet.argumentOfPeriapsis;
  const M0 = planet.meanAnomalyAtEpoch;
  const T = planet.orbitalPeriod;

  // 平近点角 = M0 + 2π * (t/T)
  const M = M0 + 2 * Math.PI * (tick / T);
  // 偏近点角
  const E = solveKepler(M % (2 * Math.PI), e);
  // 真近点角
  const nu = trueAnomaly(E, e);
  // 轨道半径
  const r = a * (1 - e * e) / (1 + e * Math.cos(nu));

  // 轨道平面坐标
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // 旋转到3D: 先绕Z轴旋转近星点幅角ω，再绕X轴倾斜i，再绕Z轴旋转升交点经度Ω
  const cosOm = Math.cos(Omega), sinOm = Math.sin(Omega);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);

  // 轨道平面内旋转ω
  const x1 = xOrb * cosw - yOrb * sinw;
  const y1 = xOrb * sinw + yOrb * cosw;

  // 绕X轴倾斜i
  const y2 = y1 * cosi;
  const z2 = y1 * sini;

  // 绕Z轴旋转Ω
  const x3 = x1 * cosOm - y2 * sinOm;
  const y3 = x1 * sinOm + y2 * cosOm;
  const z3 = z2;

  return {
    x: sys.x + x3,
    y: sys.y + y3,
    z: sys.z + z3,
  };
}

// ============================================================
// 生成星系
// ============================================================
export function generateStarSystems(universeSize: number): StarSystem[] {
  const systems: StarSystem[] = [];
  const half = universeSize / 2;
  const maxDist = half * 0.85;

  // ---- 先放置真实恒星 ----
  const realCount = Math.min(REAL_STARS.length, Math.floor(CONFIG.starSystemCount * 0.18));
  const scaleFactor = universeSize / (2 * 50); // 将光年映射到模拟空间

  for (let i = 0; i < realCount; i++) {
    const rs = REAL_STARS[i];
    // 将实际距离映射到模拟空间
    const simDist = rs.distance_ly * scaleFactor * 0.4;
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const x = clamp(Math.sin(phi) * Math.cos(theta) * simDist, -half + 30, half - 30);
    const y = clamp(Math.sin(phi) * Math.sin(theta) * simDist, -half + 30, half - 30);
    const z = clamp(Math.cos(phi) * simDist * 0.3, -half + 30, half - 30);

    const spec = STAR_SPECS[rs.type];
    const starSize = (rs.type === 'neutron' || rs.type === 'black_hole')
      ? 0.8 + Math.random() * 1.5
      : rs.radius * 1.8;

    // 行星
    const planets: Planet[] = [];
    if (rs.planets) {
      for (const rp of rs.planets) {
        const semiMajor = rp.semiMajorAU * 10; // 缩放轨道
        const ecc = rp.eccentricity;
        const inc = (Math.random() - 0.5) * 0.15;
        const lan = Math.random() * Math.PI * 2;
        const aop = Math.random() * Math.PI * 2;
        const m0 = Math.random() * Math.PI * 2;
        const gravParam = Math.max(0.1, rs.mass);
        const period = 2 * Math.PI * Math.sqrt(semiMajor * semiMajor * semiMajor / gravParam) * 6;
        const visualSize = Math.max(0.6, rp.radiusEarth * 0.55);
        const habitability = rp.habitable ? 0.6 + Math.random() * 0.4 : Math.random() * 0.15;

        planets.push({
          id: npid(), name: rp.name,
          semiMajorAxis: semiMajor, eccentricity: ecc,
          inclination: inc, longitudeOfAscendingNode: lan,
          argumentOfPeriapsis: aop, meanAnomalyAtEpoch: m0,
          orbitalPeriod: period, size: visualSize,
          habitability, occupied: false, occupantCivId: null,
        });
      }
    }

    usedStarNames.add(rs.name);
    systems.push({
      id: nsid(), name: rs.name,
      x, y, z,
      vx: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 2,
      vy: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 2,
      vz: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 0.5,
      starType: rs.type, starSize, starColor: spec.color,
      planets, destroyed: false, destroyedAt: -1, destroyCause: null,
      inBlackDomain: false, inDualVectorZone: false,
      age: Math.random() * 500, stage: 'main_sequence',
      maxAge: rs.type === 'blue_giant' ? 50 + Math.random() * 200
        : rs.type === 'yellow_dwarf' ? 3000 + Math.random() * 5000
        : 3000 + Math.random() * 8000,
    });
  }

  // ---- 填充剩余为生成恒星 ----
  const remaining = CONFIG.starSystemCount - systems.length;
  for (let i = 0; i < remaining; i++) {
    const distFromCenter = Math.abs(randomNormal(0, maxDist * 0.4));
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const x = clamp(Math.sin(phi) * Math.cos(theta) * distFromCenter, -half + 30, half - 30);
    const y = clamp(Math.sin(phi) * Math.sin(theta) * distFromCenter, -half + 30, half - 30);
    const z = clamp(Math.cos(phi) * distFromCenter * 0.3, -half + 30, half - 30);

    const starType = pickStarType(Math.abs(distFromCenter) / maxDist);
    const spec = STAR_SPECS[starType];
    // 真实半径 (R☉)，放大以便在宇宙尺度可视化
    const realRadius = spec.radiusRange[0] + Math.random() * (spec.radiusRange[1] - spec.radiusRange[0]);
    const starSize = starType === 'neutron' || starType === 'black_hole'
      ? 0.8 + Math.random() * 1.5  // 极小星体以最小可见尺寸显示
      : realRadius * 1.8;           // 太阳半径 ≈ 1 时显示尺寸为 1.8
    // 质量 (M☉)
    const mass = spec.massRange[0] + Math.random() * (spec.massRange[1] - spec.massRange[0]);

    const numPlanets = CONFIG.planetsPerSystemMin +
      Math.floor(Math.random() * (CONFIG.planetsPerSystemMax - CONFIG.planetsPerSystemMin + 1));
    const planets: Planet[] = [];

    for (let p = 0; p < numPlanets; p++) {
      // 半长轴 (AU) — 参考太阳系间距：0.4, 0.7, 1.0, 1.5, 5.2, 9.5, 19, 30...
      const semiMajor = starType === 'blue_giant'
        ? 25 + p * 35 + Math.random() * 20   // 巨星系统——间距更大
        : 12 + p * 16 * (1 + p * 0.25) + Math.random() * 8;

      // 离心率
      const ecc = Math.random() < 0.65
        ? Math.random() * 0.08   // 类太阳系近圆轨道
        : Math.random() * 0.4;   // 少数椭圆轨道

      // 倾角（相对于系统不变平面）
      const inc = Math.random() < 0.75
        ? (Math.random() - 0.5) * 0.1   // 近平面
        : (Math.random() - 0.5) * 0.6;  // 倾斜轨道

      const lan = Math.random() * Math.PI * 2;
      const aop = Math.random() * Math.PI * 2;
      const m0 = Math.random() * Math.PI * 2;

      // 轨道周期 T = 2π·√(a³/(G·M))
      // 设 G·1M☉ = 1 个模拟引力单位，则 T = 2π·√(a³/mass)
      const gravParam = Math.max(0.1, mass);
      const period = 2 * Math.PI * Math.sqrt(semiMajor * semiMajor * semiMajor / gravParam) * 6;

      // 行星大小 — 参考真实分布
      let pSize: number;
      let pLabel = '';
      const sizeRoll = Math.random();
      let cumProb = 0;
      let chosenRange: [number, number] = [1, 3];
      for (const rng of PLANET_SIZE_RANGES) {
        cumProb += rng.prob;
        if (sizeRoll < cumProb) { chosenRange = rng.range; pLabel = rng.label; break; }
      }
      pSize = chosenRange[0] + Math.random() * (chosenRange[1] - chosenRange[0]);
      // 按比例缩小以便可视化
      const visualSize = Math.max(0.6, pSize * 0.55);

      // 宜居带：基于恒星光度 L ∝ R²·T⁴
      const lum = realRadius * realRadius * Math.pow(spec.temp / 5770, 4);
      const habInner = Math.sqrt(lum) * 8;    // 内宜居边界
      const habOuter = Math.sqrt(lum) * 14;   // 外宜居边界
      let habitability = 0;
      if (semiMajor >= habInner && semiMajor <= habOuter) {
        habitability = 1 - Math.abs(semiMajor - (habInner + habOuter) / 2) / ((habOuter - habInner) / 2);
        habitability = clamp(habitability, 0, 1);
      }
      // 恒星类型修正
      if (starType === 'red_dwarf') habitability *= 0.5;
      if (starType === 'blue_giant') habitability *= 0.2;
      if (starType === 'neutron' || starType === 'black_hole') habitability = 0;
      if (starType === 'white_dwarf') habitability *= 0.15;
      // 星系边缘惩罚——越靠外环境越恶劣
      const edgeDist = Math.sqrt(x*x + y*y + z*z) / (universeSize / 2);
      const edgePenalty = edgeDist > 0.8 ? 1 - (edgeDist - 0.8) * 2 : 1;
      habitability = clamp(habitability * (0.6 + Math.random() * 0.4) * edgePenalty, 0, 1);

      planets.push({
        id: npid(), name: `${PLANET_NAMES[p % PLANET_NAMES.length]}星`,
        semiMajorAxis: semiMajor, eccentricity: ecc,
        inclination: inc, longitudeOfAscendingNode: lan,
        argumentOfPeriapsis: aop, meanAnomalyAtEpoch: m0,
        orbitalPeriod: period,
        size: visualSize,
        habitability, occupied: false, occupantCivId: null,
      });
    }

    systems.push({
      id: nsid(), name: genStarName(starType),
      x, y, z,
      vx: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 2,
      vy: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 2,
      vz: (Math.random() - 0.5) * CONFIG.starDriftSpeed * 0.5,
      starType, starSize, starColor: STAR_SPECS[starType].color,
      planets, destroyed: false, destroyedAt: -1, destroyCause: null,
      inBlackDomain: false, inDualVectorZone: false,
      age: Math.random() * 500, stage: 'main_sequence',
      maxAge: 500 + Math.random() * 1500,
    });
  }
  return systems;
}

// ============================================================
// 星系漂移更新
// ============================================================
let batchIdx = 0;
/** 对行星轨道采样，返回 3D 点数组（用于绘制轨道环） */
export function sampleOrbitPath(sys: StarSystem, planet: Planet, numPoints: number = 96): Array<{ x: number; y: number; z: number }> {
  const a = planet.semiMajorAxis;
  const e = planet.eccentricity;
  const i = planet.inclination;
  const Omega = planet.longitudeOfAscendingNode;
  const omega = planet.argumentOfPeriapsis;
  const cosOm = Math.cos(Omega), sinOm = Math.sin(Omega);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosw = Math.cos(omega), sinw = Math.sin(omega);

  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let j = 0; j <= numPoints; j++) {
    const M = (j / numPoints) * Math.PI * 2;
    const E = solveKepler(M, e);
    const nu = trueAnomaly(E, e);
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x1 = xOrb * cosw - yOrb * sinw;
    const y1 = xOrb * sinw + yOrb * cosw;
    const y2 = y1 * cosi;
    const z2 = y1 * sini;
    const x3 = x1 * cosOm - y2 * sinOm;
    const y3 = x1 * sinOm + y2 * cosOm;
    points.push({ x: sys.x + x3, y: sys.y + y3, z: sys.z + z2 });
  }
  return points;
}

export function updateStarSystems(systems: StarSystem[], universeSize: number, tick: number): void {
  const half = universeSize / 2;
  const batchSize = 60;
  const start = (batchIdx * batchSize) % Math.max(1, systems.length);
  batchIdx++;
  for (let i = 0; i < batchSize; i++) {
    const sys = systems[(start + i) % systems.length];
    if (!sys) continue;
    sys.x += sys.vx; sys.y += sys.vy; sys.z += sys.vz;
    if (Math.abs(sys.x) > half - 50) sys.vx *= -1;
    if (Math.abs(sys.y) > half - 50) sys.vy *= -1;
    if (Math.abs(sys.z) > half - 50) sys.vz *= -1;
  }
}

/** 寻找宜居行星 */
export function findHabitablePlanet(systems: StarSystem[]): { system: StarSystem; planet: Planet } | null {
  const candidates: Array<{ system: StarSystem; planet: Planet; score: number }> = [];
  for (const sys of systems) {
    if (sys.destroyed || sys.inBlackDomain) continue;
    for (const pl of sys.planets) {
      if (!pl.occupied && pl.habitability > 0.3) {
        candidates.push({ system: sys, planet: pl, score: pl.habitability });
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
  chosen.planet.occupied = true;
  return { system: chosen.system, planet: chosen.planet };
}

// 已用名称集合（防重复）
const usedStarNames = new Set<string>();
function genStarName(type: StarType): string {
  // 扩充前缀库
  const p: Record<StarType, string[]> = {
    red_dwarf: ['格利泽', '罗斯', '鲁坦', '拉卡伊', '沃尔夫', '斯特鲁维', '克鲁格', '范玛宁', '蒂加登', '拉兰德', '卡普坦', '比邻', '荧惑', '红矮'],
    yellow_dwarf: ['天仓', '天苑', '天纪', '天棓', '天钩', '南门', '北河', '五帝', '柱史', '女史', '柱国', '御女', '天枢', '天璇'],
    blue_giant: ['参宿', '天津', '北落', '弧矢', '十字架', '马腹', '水委', '五车', '柱一', '柱二', '南船', '海石', '天社', '天记'],
    white_dwarf: ['范玛宁', '天狼', '南河', '五车', '波江', '玉衡', '摇光', '开阳', '天权', '天玑', '天璇星'],
    neutron: ['脉冲星', '中子星', '伽马源', 'X射线', '磁星', '毫秒脉冲', '双星脉冲', '孤立中子'],
    black_hole: ['天鹅X-1', '麒麟V616', '天鹰V404', '蛇夫X-1', '微类星体', '暗流', '视界', '奇点源'],
  };
  const num = Math.floor(Math.random() * 9999) + 1;
  const base = p[type][Math.floor(Math.random() * p[type].length)];
  // 尝试生成唯一名称
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = `${base}-${num + attempt}`;
    if (!usedStarNames.has(name)) {
      usedStarNames.add(name);
      return name;
    }
  }
  // fallback
  const fallback = `${base}-${Math.floor(Math.random() * 99999)}`;
  usedStarNames.add(fallback);
  return fallback;
}

function randomNormal(m: number, s: number): number {
  let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

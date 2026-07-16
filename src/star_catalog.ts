// ============================================================
// 真实恒星目录 — 基于实际天文观测数据
// 太阳邻域 ~50 光年内的著名恒星 + 亮星
// 数据来源：SIMBAD, NASA Exoplanet Archive, Hipparcos
// ============================================================

import type { StarType } from './types';

export interface RealStar {
  name: string;              // 中文名/国际名
  type: StarType;
  radius: number;            // R☉
  mass: number;              // M☉
  temperature: number;       // K
  distance_ly: number;       // 距太阳光年
  constellation: string;     // 星座
  /** 已知行星（名称, 类型, 轨道半长轴 AU, 离心率, 半径R🜨, 宜居） */
  planets?: Array<{
    name: string;
    type: 'rocky' | 'super_earth' | 'ice_giant' | 'gas_giant';
    semiMajorAU: number;
    eccentricity: number;
    radiusEarth: number;
    habitable: boolean;
  }>;
}

// ============================================================
// 太阳邻域真实恒星 (~70颗)
// ============================================================
export const REAL_STARS: RealStar[] = [
  // ---- 太阳 ----
  { name: '太阳 Sol', type: 'yellow_dwarf', radius: 1.0, mass: 1.0, temperature: 5772, distance_ly: 0, constellation: '—',
    planets: [
      { name: '水星', type: 'rocky', semiMajorAU: 0.387, eccentricity: 0.206, radiusEarth: 0.383, habitable: false },
      { name: '金星', type: 'rocky', semiMajorAU: 0.723, eccentricity: 0.007, radiusEarth: 0.949, habitable: false },
      { name: '地球', type: 'rocky', semiMajorAU: 1.000, eccentricity: 0.017, radiusEarth: 1.000, habitable: true },
      { name: '火星', type: 'rocky', semiMajorAU: 1.524, eccentricity: 0.093, radiusEarth: 0.532, habitable: false },
      { name: '木星', type: 'gas_giant', semiMajorAU: 5.203, eccentricity: 0.048, radiusEarth: 11.21, habitable: false },
      { name: '土星', type: 'gas_giant', semiMajorAU: 9.537, eccentricity: 0.054, radiusEarth: 9.45, habitable: false },
      { name: '天王星', type: 'ice_giant', semiMajorAU: 19.19, eccentricity: 0.047, radiusEarth: 4.01, habitable: false },
      { name: '海王星', type: 'ice_giant', semiMajorAU: 30.07, eccentricity: 0.009, radiusEarth: 3.88, habitable: false },
    ]},
  // ---- 南门二系统 ----
  { name: '南门二A Rigil Kentaurus', type: 'yellow_dwarf', radius: 1.22, mass: 1.10, temperature: 5790, distance_ly: 4.37, constellation: '半人马' },
  { name: '南门二B Toliman', type: 'yellow_dwarf', radius: 0.86, mass: 0.91, temperature: 5260, distance_ly: 4.37, constellation: '半人马' },
  { name: '比邻星 Proxima', type: 'red_dwarf', radius: 0.154, mass: 0.122, temperature: 3042, distance_ly: 4.25, constellation: '半人马',
    planets: [
      { name: '比邻b', type: 'rocky', semiMajorAU: 0.049, eccentricity: 0.02, radiusEarth: 1.07, habitable: true },
      { name: '比邻c', type: 'super_earth', semiMajorAU: 1.489, eccentricity: 0.04, radiusEarth: 2.0, habitable: false },
    ]},
  // ---- 巴纳德星 ----
  { name: '巴纳德星 Barnard', type: 'red_dwarf', radius: 0.196, mass: 0.144, temperature: 3134, distance_ly: 5.96, constellation: '蛇夫',
    planets: [{ name: '巴纳德b', type: 'rocky', semiMajorAU: 0.404, eccentricity: 0.03, radiusEarth: 0.98, habitable: false }]},
  // ---- 沃尔夫359 ----
  { name: '沃尔夫359 Wolf 359', type: 'red_dwarf', radius: 0.145, mass: 0.09, temperature: 2800, distance_ly: 7.86, constellation: '狮子' },
  // ---- 拉兰德21185 ----
  { name: '拉兰德21185 Lalande', type: 'red_dwarf', radius: 0.393, mass: 0.39, temperature: 3601, distance_ly: 8.31, constellation: '大熊' },
  // ---- 天狼星 ----
  { name: '天狼星A Sirius', type: 'yellow_dwarf', radius: 1.711, mass: 2.02, temperature: 9940, distance_ly: 8.60, constellation: '大犬' },
  { name: '天狼星B Sirius B', type: 'white_dwarf', radius: 0.0084, mass: 1.02, temperature: 25200, distance_ly: 8.60, constellation: '大犬' },
  // ---- 鲁坦726-8 ----
  { name: '鲁坦726-8 Luyten', type: 'red_dwarf', radius: 0.14, mass: 0.10, temperature: 2670, distance_ly: 8.73, constellation: '鲸鱼' },
  // ---- 罗斯154 ----
  { name: '罗斯154 Ross 154', type: 'red_dwarf', radius: 0.17, mass: 0.17, temperature: 3100, distance_ly: 9.70, constellation: '人马' },
  // ---- 罗斯248 ----
  { name: '罗斯248 Ross 248', type: 'red_dwarf', radius: 0.16, mass: 0.14, temperature: 3000, distance_ly: 10.3, constellation: '仙女' },
  // ---- 天苑四 ----
  { name: '天苑四 Epsilon Eridani', type: 'yellow_dwarf', radius: 0.74, mass: 0.82, temperature: 5084, distance_ly: 10.5, constellation: '波江',
    planets: [{ name: '天苑四b', type: 'gas_giant', semiMajorAU: 3.53, eccentricity: 0.26, radiusEarth: 10.5, habitable: false }]},
  // ---- 拉卡伊9352 ----
  { name: '拉卡伊9352 Lacaille', type: 'red_dwarf', radius: 0.47, mass: 0.50, temperature: 3630, distance_ly: 10.7, constellation: '南鱼' },
  // ---- 罗斯128 ----
  { name: '罗斯128 Ross 128', type: 'red_dwarf', radius: 0.20, mass: 0.17, temperature: 3192, distance_ly: 11.0, constellation: '室女',
    planets: [{ name: '罗斯128b', type: 'rocky', semiMajorAU: 0.050, eccentricity: 0.12, radiusEarth: 1.35, habitable: true }]},
  // ---- 南河三 ----
  { name: '南河三A Procyon', type: 'yellow_dwarf', radius: 2.05, mass: 1.50, temperature: 6530, distance_ly: 11.5, constellation: '小犬' },
  { name: '南河三B Procyon B', type: 'white_dwarf', radius: 0.012, mass: 0.60, temperature: 7740, distance_ly: 11.5, constellation: '小犬' },
  // ---- 天仓五 ----
  { name: '天仓五 Tau Ceti', type: 'yellow_dwarf', radius: 0.79, mass: 0.78, temperature: 5344, distance_ly: 11.9, constellation: '鲸鱼',
    planets: [
      { name: '天仓五e', type: 'rocky', semiMajorAU: 0.538, eccentricity: 0.18, radiusEarth: 1.2, habitable: true },
      { name: '天仓五f', type: 'super_earth', semiMajorAU: 1.334, eccentricity: 0.16, radiusEarth: 1.8, habitable: true },
    ]},
  // ---- 格利泽1061 ----
  { name: '格利泽1061 GJ 1061', type: 'red_dwarf', radius: 0.16, mass: 0.12, temperature: 2953, distance_ly: 12.0, constellation: '时钟' },
  // ---- 卡普坦星 ----
  { name: '卡普坦星 Kapteyn', type: 'red_dwarf', radius: 0.29, mass: 0.28, temperature: 3550, distance_ly: 12.8, constellation: '绘架' },
  // ---- 织女星 ----
  { name: '织女星 Vega', type: 'blue_giant', radius: 2.36, mass: 2.14, temperature: 9602, distance_ly: 25.0, constellation: '天琴' },
  // ---- 牛郎星 ----
  { name: '牛郎星 Altair', type: 'blue_giant', radius: 1.83, mass: 1.79, temperature: 7700, distance_ly: 16.7, constellation: '天鹰' },
  // ---- 北落师门 ----
  { name: '北落师门 Fomalhaut', type: 'blue_giant', radius: 1.84, mass: 1.92, temperature: 8590, distance_ly: 25.1, constellation: '南鱼' },
  // ---- 五车二 ----
  { name: '五车二 Capella', type: 'yellow_dwarf', radius: 11.98, mass: 2.57, temperature: 4970, distance_ly: 42.9, constellation: '御夫' },
  // ---- 北极星 ----
  { name: '北极星 Polaris', type: 'yellow_dwarf', radius: 37.5, mass: 5.4, temperature: 6015, distance_ly: 90, constellation: '小熊' },
  // ---- 大角星 ----
  { name: '大角星 Arcturus', type: 'yellow_dwarf', radius: 25.4, mass: 1.08, temperature: 4286, distance_ly: 36.7, constellation: '牧夫' },
  // ---- TRAPPIST-1 ----
  { name: 'TRAPPIST-1', type: 'red_dwarf', radius: 0.119, mass: 0.089, temperature: 2566, distance_ly: 40.7, constellation: '宝瓶',
    planets: [
      { name: 'TRAPPIST-1b', type: 'rocky', semiMajorAU: 0.011, eccentricity: 0.006, radiusEarth: 1.12, habitable: false },
      { name: 'TRAPPIST-1c', type: 'rocky', semiMajorAU: 0.016, eccentricity: 0.007, radiusEarth: 1.10, habitable: false },
      { name: 'TRAPPIST-1d', type: 'rocky', semiMajorAU: 0.022, eccentricity: 0.008, radiusEarth: 0.79, habitable: false },
      { name: 'TRAPPIST-1e', type: 'rocky', semiMajorAU: 0.029, eccentricity: 0.008, radiusEarth: 0.92, habitable: true },
      { name: 'TRAPPIST-1f', type: 'rocky', semiMajorAU: 0.038, eccentricity: 0.009, radiusEarth: 1.04, habitable: true },
      { name: 'TRAPPIST-1g', type: 'rocky', semiMajorAU: 0.047, eccentricity: 0.009, radiusEarth: 1.15, habitable: true },
      { name: 'TRAPPIST-1h', type: 'rocky', semiMajorAU: 0.062, eccentricity: 0.009, radiusEarth: 0.73, habitable: false },
    ]},
  // ---- 开普勒442 ----
  { name: '开普勒442 Kepler-442', type: 'yellow_dwarf', radius: 0.60, mass: 0.61, temperature: 4402, distance_ly: 1206, constellation: '天琴',
    planets: [{ name: '开普勒442b', type: 'super_earth', semiMajorAU: 0.409, eccentricity: 0.04, radiusEarth: 1.34, habitable: true }]},
  // ---- 开普勒62 ----
  { name: '开普勒62 Kepler-62', type: 'yellow_dwarf', radius: 0.64, mass: 0.69, temperature: 5000, distance_ly: 982, constellation: '天琴',
    planets: [
      { name: '开普勒62e', type: 'super_earth', semiMajorAU: 0.427, eccentricity: 0.05, radiusEarth: 1.61, habitable: true },
      { name: '开普勒62f', type: 'super_earth', semiMajorAU: 0.718, eccentricity: 0.05, radiusEarth: 1.41, habitable: true },
    ]},
  // ---- 更多红矮星邻域恒星 ----
  { name: '格利泽876 GJ 876', type: 'red_dwarf', radius: 0.38, mass: 0.37, temperature: 3340, distance_ly: 15.3, constellation: '宝瓶' },
  { name: '格利泽581 GJ 581', type: 'red_dwarf', radius: 0.30, mass: 0.31, temperature: 3480, distance_ly: 20.5, constellation: '天秤' },
  { name: '格利泽667C GJ 667C', type: 'red_dwarf', radius: 0.20, mass: 0.31, temperature: 3440, distance_ly: 22.2, constellation: '天蝎' },
  // ---- 更多亮星 ----
  { name: '轩辕十四 Regulus', type: 'blue_giant', radius: 4.0, mass: 3.8, temperature: 12460, distance_ly: 79.3, constellation: '狮子' },
  { name: '毕宿五 Aldebaran', type: 'yellow_dwarf', radius: 44.2, mass: 1.16, temperature: 3910, distance_ly: 65.3, constellation: '金牛' },
  { name: '北河三 Pollux', type: 'yellow_dwarf', radius: 8.8, mass: 1.91, temperature: 4666, distance_ly: 33.8, constellation: '双子' },
  { name: '十字架二 Acrux', type: 'blue_giant', radius: 5.0, mass: 14, temperature: 25000, distance_ly: 322, constellation: '南十字' },
  { name: '马腹一 Hadar', type: 'blue_giant', radius: 9.0, mass: 10.7, temperature: 25000, distance_ly: 392, constellation: '半人马' },
];

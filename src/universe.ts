// ============================================================
// 黑暗森林模拟器 — 3D 宇宙空间
// ============================================================

import type { Civilization, Point } from './types';
import { CONFIG } from './config';

interface ResourceBlob3D {
  cx: number; cy: number; cz: number;
  sigma: number;
  amplitude: number;
}

export class Universe {
  readonly size: number;
  private resourceBlobs: ResourceBlob3D[] = [];

  constructor(size: number, abundance: number) {
    this.size = size;
    this.generateResources(abundance);
  }

  private generateResources(abundance: number): void {
    const numBlobs = Math.floor(6 + abundance * 15);
    const half = this.size / 2;
    for (let i = 0; i < numBlobs; i++) {
      this.resourceBlobs.push({
        cx: (Math.random() - 0.5) * this.size * 0.8,
        cy: (Math.random() - 0.5) * this.size * 0.8,
        cz: (Math.random() - 0.5) * this.size * 0.8,
        sigma: 80 + Math.random() * 250,
        amplitude: abundance * CONFIG.resourceMaxPerCell * (0.5 + Math.random() * 0.5),
      });
    }
  }

  /** 3D 距离 */
  distance(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** 获取 3D 空间中某点的资源密度 */
  getResourceAt(x: number, y: number, z: number): number {
    let density = 0;
    for (const blob of this.resourceBlobs) {
      const dx = x - blob.cx;
      const dy = y - blob.cy;
      const dz = z - blob.cz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      const sigma2 = blob.sigma * blob.sigma;
      density += blob.amplitude * Math.exp(-dist2 / (2 * sigma2));
    }
    return Math.max(1, density);
  }

  /** 文明在势力范围内开采资源 */
  extractResources(civ: Civilization): number {
    let total = 0;
    const samples = 12;
    for (let i = 0; i < samples; i++) {
      // 在球面上均匀采样
      const phi = Math.acos(1 - 2 * (i + 0.5) / samples);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const sx = civ.x + Math.sin(phi) * Math.cos(theta) * civ.controlRadius * 0.7;
      const sy = civ.y + Math.sin(phi) * Math.sin(theta) * civ.controlRadius * 0.7;
      const sz = civ.z + Math.cos(phi) * civ.controlRadius * 0.7;
      total += this.getResourceAt(sx, sy, sz);
    }
    const avg = total / samples;
    const efficiency = 0.1 + civ.techTree.economics * 0.02;
    return avg * efficiency * civ.population * 0.01;
  }

  /** 检查点是否在宇宙边界内 */
  isInBounds(x: number, y: number, z: number): boolean {
    const half = this.size / 2;
    return x > -half && x < half && y > -half && y < half && z > -half && z < half;
  }

  /** 将点限制在宇宙边界内 */
  clampToBounds(x: number, y: number, z: number): Point {
    const half = this.size / 2;
    return {
      x: Math.max(-half + 10, Math.min(half - 10, x)),
      y: Math.max(-half + 10, Math.min(half - 10, y)),
      z: Math.max(-half + 10, Math.min(half - 10, z)),
    };
  }

  /** 获取可视化颜色（用于 Canvas 背景——采样 XY 平面的切片） */
  getResourceColor(x: number, y: number, z: number): [number, number, number] {
    const density = this.getResourceAt(x, y, z);
    const normalized = Math.min(1, density / (CONFIG.resourceMaxPerCell * 0.6));
    return [
      Math.floor(2 + normalized * 4),
      Math.floor(3 + normalized * 8),
      Math.floor(2 + normalized * 4),
    ];
  }

  /** 生成 3D 空间中的随机位置 */
  randomPosition(margin: number = 50): Point {
    const half = this.size / 2 - margin;
    return {
      x: (Math.random() - 0.5) * half * 2,
      y: (Math.random() - 0.5) * half * 2,
      z: (Math.random() - 0.5) * half * 2,
    };
  }
}

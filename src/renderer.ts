// ============================================================
// 黑暗森林 — 3D 渲染器 v8
// 自由飞行相机：鼠标旋转视角 | WASD移动 | 滚轮向光标缩放
// ============================================================

import type { CivRenderData, RenderLink, DualVectorRenderData, StarSystem, Planet } from './types';
import type { Universe } from './universe';
import { getPlanetPosition, sampleOrbitPath } from './galaxy';
import { CONFIG } from './config';

// ============================================================
// 自由飞行相机 — 宇宙中的飞船
// ============================================================
class FreeCamera {
  // 位置 — 星系盘前上方，俯瞰全景
  x = 0; y = 2500; z = 3000;
  tx = 0; ty = 2500; tz = 3000;
  // 朝向 — 正对原点（星系中心），yaw=0 朝向 -z
  yaw = 0;
  pitch = 0.694;   // asin(2500/3907) ≈ 0.694 → 原点在视野正中
  tyaw = 0;
  tpitch = 0.694;
  // 惯性
  vyaw = 0; vpitch = 0;

  private cw = 800; private ch = 600;

  setCanvas(w: number, h: number): void { this.cw = w; this.ch = h; }

  // ---- 相机基向量（标准FPS相机） ----
  forward(): { x: number; y: number; z: number } {
    return {
      x: Math.cos(this.pitch) * Math.sin(this.yaw),
      y: -Math.sin(this.pitch),
      z: -Math.cos(this.pitch) * Math.cos(this.yaw),
    };
  }
  private rightVec(): { x: number; y: number; z: number } {
    const f = this.forward();
    // cross(worldUp(0,1,0), forward)
    const rx = f.z; // 1*f.z - 0*f.y → but world up is (0,1,0)
    const ry = 0;
    const rz = -f.x;
    const mag = Math.sqrt(rx * rx + rz * rz) || 1;
    return { x: rx / mag, y: 0, z: rz / mag };
  }
  private upVec(): { x: number; y: number; z: number } {
    const f = this.forward();
    const r = this.rightVec();
    // cross(forward, right)
    return {
      x: f.y * r.z - f.z * r.y,
      y: f.z * r.x - f.x * r.z,
      z: f.x * r.y - f.y * r.x,
    };
  }

  // ---- 更新（阻尼平滑） ----
  update(dt: number): void {
    const d = Math.min(1, 10 * dt);
    this.yaw += this.vyaw * dt; this.pitch += this.vpitch * dt;
    this.vyaw *= Math.pow(0.01, dt); this.vpitch *= Math.pow(0.01, dt);
    this.yaw += (this.tyaw - this.yaw) * d;
    this.pitch += (this.tpitch - this.pitch) * d;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    this.x += (this.tx - this.x) * d;
    this.y += (this.ty - this.y) * d;
    this.z += (this.tz - this.z) * d;
  }

  // ---- 旋转（鼠标拖拽） ----
  rotate(dyaw: number, dpitch: number): void {
    this.tyaw += dyaw;
    this.tpitch = clamp(this.tpitch + dpitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  // ---- 移动（WASD/QE — 相对于相机朝向） ----
  moveForward(dist: number): void {
    const f = this.forward();
    this.tx += f.x * dist; this.ty += f.y * dist; this.tz += f.z * dist;
  }
  moveRight(dist: number): void {
    const r = this.rightVec();
    this.tx += r.x * dist; this.tz += r.z * dist;
  }
  moveUp(dist: number): void {
    this.ty += dist;
  }

  // ---- 缩放（向光标方向推进） ----
  zoomTowardCursor(mx: number, my: number, factor: number): void {
    // 获取光标指向的屏幕坐标对应的世界方向
    const ray = this.screenToWorldRay(mx, my);
    // 沿该方向移动
    const dist = this.distanceToTarget() * (1 - factor);
    this.tx += ray.x * dist;
    this.ty += ray.y * dist;
    this.tz += ray.z * dist;
  }

  /** 屏幕坐标 → 世界空间射线方向 */
  private screenToWorldRay(sx: number, sy: number): { x: number; y: number; z: number } {
    const f = this.forward(), r = this.rightVec(), u = this.upVec();
    const ndcX = (sx / this.cw - 0.5) * 2;
    const ndcY = (0.5 - sy / this.ch) * 2;
    const aspect = this.cw / this.ch;
    const rx = f.x + r.x * ndcX * aspect + u.x * ndcY;
    const ry = f.y + r.y * ndcX * aspect + u.y * ndcY;
    const rz = f.z + r.z * ndcX * aspect + u.z * ndcY;
    const mag = Math.sqrt(rx * rx + ry * ry + rz * rz);
    return { x: rx / mag, y: ry / mag, z: rz / mag };
  }

  private distanceToTarget(): number {
    // 返回一个合理的缩放步长
    return Math.max(50, Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) * 0.08);
  }

  /** 3D → 2D 投影 */
  project(wx: number, wy: number, wz: number): [number, number, number] {
    const f = this.forward(), r = this.rightVec(), u = this.upVec();
    const dx = wx - this.x, dy = wy - this.y, dz = wz - this.z;
    // 点积到相机坐标系：右、上、前
    const cx = dx * r.x + dy * r.y + dz * r.z;
    const cy = dx * u.x + dy * u.y + dz * u.z;
    const cz = dx * f.x + dy * f.y + dz * f.z;
    const focal = 700;
    if (cz < 1) return [0, 0, 0];
    const scale = focal / cz;
    return [this.cw / 2 + cx * scale, this.ch / 2 - cy * scale, cz];
  }

  /** 视锥体粗略裁剪 */
  isVisible(wx: number, wy: number, wz: number, radius: number): boolean {
    const [, , depth] = this.project(wx, wy, wz);
    if (depth < 3) return false;
    const f = 700 / Math.max(1, depth);
    const sr = radius * f * 0.25;
    return !(sr < 0.3 && depth > 4000);
  }

  /** 惯性 */
  flick(dyawPerSec: number, dpitchPerSec: number): void {
    this.vyaw = dyawPerSec; this.vpitch = dpitchPerSec;
  }

  /** 射线-球体相交检测，返回命中距离，-1=未命中 */
  rayHitSphere(sx: number, sy: number, sz: number, radius: number): number {
    const f = this.forward();
    const ox = this.x - sx, oy = this.y - sy, oz = this.z - sz;
    const b = 2 * (ox * f.x + oy * f.y + oz * f.z);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const d = b * b - 4 * c;
    if (d < 0) return -1;
    const t = (-b - Math.sqrt(d)) / 2;
    return t > 0 ? t : -1;
  }

  /** 投射射线，返回第一个命中的目标 */
  castRay(
    starSystems: StarSystem[],
    civs: CivRenderData[],
  ): { type: 'star'; id: string; name: string } | { type: 'civ'; id: string; name: string } | null {
    let closest = Infinity;
    let target: any = null;
    for (const sys of starSystems) {
      const r = sys.destroyed ? sys.starSize * 2 : sys.starSize * 4;
      const t = this.rayHitSphere(sys.x, sys.y, sys.z, r);
      let label = sys.name;
      if (sys.inBlackDomain) label += ' [黑域]';
      if (sys.inDualVectorZone) label += ' [二向箔]';
      if (sys.destroyed) label += ' [残骸]';
      if (t > 0 && t < closest) { closest = t; target = { type: 'star', id: sys.id, name: label }; }
    }
    if (civs) {
      for (const civ of civs) {
        if (!civ.alive) continue;
        const t = this.rayHitSphere(civ.x, civ.y, civ.z, Math.max(civ.controlRadius, 30));
        if (t > 0 && t < closest) { closest = t; target = { type: 'civ', id: civ.id, name: civ.name }; }
      }
    }
    return target;
  }

  /** 聚焦某个目标 */
  focusOn(wx: number, wy: number, wz: number): void {
    // 放在目标前方不远处
    this.tx = wx;
    this.ty = wy + 100;
    this.tz = wz + 300;
    // 朝向 -z 方向（看向目标），略微下俯
    this.tyaw = 0;
    this.tpitch = 0.2;
  }
}

// ============================================================
// 渲染器
// ============================================================
export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  camera: FreeCamera;

  private mx = 0; private my = 0;
  private lBtn = false; private rBtn = false;
  private pMX = 0; private pMY = 0;
  private lmt = 0;

  private keys: Record<string, boolean> = {};
  private flashes: Array<{ x: number; y: number; z: number; t: number; max: number; color: string }> = [];
  private frame = 0;
  private starSystems: StarSystem[] = [];
  private selectedSystemId: string | null = null;
  private renderDist = 5000;
  // 射线瞄准
  aimedTarget: { type: 'star'; id: string; name: string } | { type: 'civ'; id: string; name: string } | null = null;
  // 单击锁定
  lockedTarget: { type: 'star'; id: string; name: string } | { type: 'civ'; id: string; name: string } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = new FreeCamera();
    this.setupInput();
    this.resize();
  }

  setStarSystems(s: StarSystem[]): void { this.starSystems = s; }
  selectSystem(id: string | null): void { this.selectedSystemId = id; }

  resize(): void {
    const c = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.setCanvas(w, h);
  }

  // ---- 输入（指针锁定 + 右键平移） ----
  private setupInput(): void {
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // 单击→锁定指针（但如果紧跟双击则取消）
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    this.canvas.addEventListener('click', () => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (!document.pointerLockElement) {
          this.canvas.requestPointerLock();
        }
      }, 280);
    });
    this.canvas.addEventListener('dblclick', () => {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    });

    // 单击锁定目标
    let clickPending = false;
    this.canvas.addEventListener('click', () => {
      if (!document.pointerLockElement || clickPending) return;
      clickPending = true;
      setTimeout(() => { clickPending = false; }, 300);
      if (this.aimedTarget) {
        this.lockedTarget = { ...this.aimedTarget };
        // 锁定文明时，同时改为锁定其母星系（显示轨道）
        if (this.aimedTarget.type === 'civ') {
          const rd = (this as any)._lastCivData as CivRenderData[] | undefined;
          const civRd = rd?.find(c => c.id === this.aimedTarget!.id);
          if (civRd?.homeSystemId) {
            const sys = this.starSystems.find(s => s.id === civRd.homeSystemId);
            if (sys) {
              this.lockedTarget = { type: 'star', id: sys.id, name: sys.name };
            }
          }
        }
      }
    });

    // 指针移动 → 旋转视角（锁定状态下）
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.canvas) {
        this.camera.rotate(-e.movementX * 0.003, e.movementY * 0.003);
      }
      // 更新鼠标位置（用于悬停检测和右键平移）
      const rect = this.canvas.getBoundingClientRect();
      this.mx = e.clientX - rect.left;
      this.my = e.clientY - rect.top;
    });

    // 右键 = 取消锁定；右键拖拽 = 平移
    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 2) {
        if (this.lockedTarget) { this.lockedTarget = null; return; }
        this.rBtn = true; this.pMX = this.mx; this.pMY = this.my;
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 2) this.rBtn = false;
    });
    this.canvas.addEventListener('mousemove', e => {
      if (this.rBtn) {
        const dx = this.mx - this.pMX, dy = this.my - this.pMY;
        const speed = this.cameraForwardDist() * 0.001;
        this.camera.moveRight(-dx * speed);
        this.camera.moveUp(dy * speed);
        this.pMX = this.mx; this.pMY = this.my;
      }
    });

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1.15;
      // 向鼠标光标方向缩放
      this.camera.zoomTowardCursor(this.mx, this.my, factor);
    }, { passive: false });

    this.canvas.addEventListener('dblclick', () => {
      this.camera.tx = 0; this.camera.ty = 2500; this.camera.tz = 3000;
      this.camera.tyaw = 0; this.camera.tpitch = 0.694;
    });

    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }

  private cameraForwardDist(): number {
    return Math.max(50, Math.sqrt(this.camera.x ** 2 + this.camera.y ** 2 + this.camera.z ** 2));
  }

  /** 键盘操控相机（每帧） */
  private handleKeyboard(dt: number): void {
    const dist = this.cameraForwardDist();
    const moveSpeed = dist * 0.5 * dt;   // 移动速度与当前"深度"成正比
    const slowMove = moveSpeed * 0.3;

    if (this.keys['w']) this.camera.moveForward(moveSpeed);
    if (this.keys['s']) this.camera.moveForward(-moveSpeed);
    if (this.keys['a']) this.camera.moveRight(-moveSpeed);
    if (this.keys['d']) this.camera.moveRight(moveSpeed);
    if (this.keys['q']) this.camera.moveUp(-slowMove);
    if (this.keys['e']) this.camera.moveUp(slowMove);
    // 方向键 = 慢速旋转
    const rotSpeed = 1.2 * dt;
    if (this.keys['arrowleft']) this.camera.rotate(-rotSpeed, 0);
    if (this.keys['arrowright']) this.camera.rotate(rotSpeed, 0);
    if (this.keys['arrowup']) this.camera.rotate(0, rotSpeed);
    if (this.keys['arrowdown']) this.camera.rotate(0, -rotSpeed);
  }

  addFlash(x: number, y: number, z: number, color: string = '#ff6b35'): void {
    this.flashes.push({ x, y, z, t: 0, max: 30, color });
  }

  // ---- 主渲染 ----
  render(
    civs: CivRenderData[], links: RenderLink[],
    dvZones: DualVectorRenderData[], universe: Universe, tick: number, dt: number,
  ): { hovered: CivRenderData | null } {
    this.frame++;
    (this as any)._lastCivData = civs;
    this.handleKeyboard(dt);
    this.camera.update(dt);

    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    this.drawDeepSpace(w, h);

    interface Item { z: number; draw: () => void; }
    const items: Item[] = [];

    // 星系——仅渲染距离相机 renderDist 以内的
    for (const sys of this.starSystems) {
      // 快速距离检查（相机到恒星的3D距离）
      const camDist = Math.sqrt(
        (this.camera.x - sys.x) ** 2 +
        (this.camera.y - sys.y) ** 2 +
        (this.camera.z - sys.z) ** 2
      );
      if (camDist > this.renderDist) continue;
      if (sys.destroyed && camDist > 1500) continue; // 残骸仅近处可见

      if (!this.camera.isVisible(sys.x, sys.y, sys.z, sys.starSize * 5)) continue;
      const [sx, sy, sz] = this.camera.project(sys.x, sys.y, sys.z);
      if (sz < 3) continue;
      items.push({ z: sz, draw: () => this.drawStar(sys, sx, sy, sz) });

      // 轨道环——仅极近时或选中时显示
      const showOrbits = sys.id === this.selectedSystemId;
      if (showOrbits && !sys.destroyed && (sys.x !== 0 || sys.y !== 0 || sys.z !== 0)) {
        for (const pl of sys.planets) {
          if (pl.semiMajorAxis > 500) continue; // 超大轨道跳过
          const orbit = sampleOrbitPath(sys, pl, 48);
          items.push({ z: sz, draw: () => {
            const ctx = this.ctx;
            ctx.beginPath();
            let first = true;
            for (const pt of orbit) {
              const [ox, oy] = this.camera.project(pt.x, pt.y, pt.z);
              if (first) { ctx.moveTo(ox, oy); first = false; }
              else ctx.lineTo(ox, oy);
            }
            ctx.closePath();
            const orbAlpha = sz < 200 ? 0.35 : sz < 350 ? 0.25 : 0.18;
            ctx.strokeStyle = `rgba(200,220,255,${orbAlpha})`;
            ctx.lineWidth = sz < 200 ? 1.4 : 1.0;
            ctx.stroke();
          }});
        }
      }

      if (sz < 6000 && !sys.destroyed) {
        for (const pl of sys.planets) {
          const pp = getPlanetPosition(sys, pl, tick);
          if (!this.camera.isVisible(pp.x, pp.y, pp.z, 2)) continue;
          const [px, py, pz] = this.camera.project(pp.x, pp.y, pp.z);
          if (pz < 3) continue;
          items.push({ z: pz, draw: () => this.drawPlanet(pl, px, py, pz) });
        }
      }

      if (sys.inBlackDomain && !sys.destroyed) {
        const f = 700 / Math.max(1, sz); const r = Math.max(30, sys.starSize * 25) * f * 0.3;
        const pulse = 0.7 + 0.3 * Math.sin(this.frame * 0.04);
        items.push({ z: sz, draw: () => {
          // 外层光晕——大范围暗蓝扩散
          const g = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 1.5);
          g.addColorStop(0, `rgba(20,30,80,${0.3 * pulse})`);
          g.addColorStop(0.6, `rgba(15,20,60,${0.15 * pulse})`);
          g.addColorStop(1, 'rgba(0,0,20,0)');
          ctx.beginPath(); ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
          // 边界双环
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(50,80,220,${0.6 * pulse})`; ctx.lineWidth = 3;
          ctx.setLineDash([6, 12]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(sx, sy, r * 0.8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(80,120,255,${0.5 * pulse})`; ctx.lineWidth = 1.5;
          ctx.stroke();
        }});
      }
      if (sys.destroyed) {
        const f = 700 / Math.max(1, sz); const rr = sys.starSize * 4 * f * 0.3;
        const age = tick - sys.destroyedAt; const fa = Math.max(0.05, 0.55 - age * 0.0006);
        items.push({ z: sz, draw: () => {
          const g = ctx.createRadialGradient(sx, sy, rr * 0.1, sx, sy, rr * 1.8);
          g.addColorStop(0, `rgba(180,60,20,${fa * 0.5})`);
          g.addColorStop(0.5, `rgba(80,20,0,${fa * 0.25})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath(); ctx.arc(sx, sy, rr * 1.8, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        }});
      }
    }

    // 二向箔——显著紫色区域 + 网格 + 脉冲边界
    for (const zr of dvZones) {
      if (!this.camera.isVisible(zr.x, zr.y, zr.z, zr.radius)) continue;
      const [sx, sy, sz] = this.camera.project(zr.x, zr.y, zr.z);
      if (sz < 3) continue;
      const f = 700 / Math.max(1, sz); const r = zr.radius * f * 0.25;
      const pulse = 0.8 + 0.2 * Math.sin(this.frame * 0.06 + zr.radius * 0.001);
      items.push({ z: sz, draw: () => {
        // 外层扩散光晕
        const og = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 1.6);
        og.addColorStop(0, `rgba(180,30,230,${zr.alpha * 0.5 * pulse})`);
        og.addColorStop(0.5, `rgba(120,15,180,${zr.alpha * 0.3})`);
        og.addColorStop(1, 'rgba(20,0,60,0)');
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = og; ctx.fill();
        // 主体渐变
        const g = ctx.createRadialGradient(sx, sy, r * 0.02, sx, sy, r);
        g.addColorStop(0, `rgba(200,40,240,${zr.alpha * 0.7 * pulse})`);
        g.addColorStop(0.3, `rgba(140,20,200,${zr.alpha * 0.5})`);
        g.addColorStop(0.7, `rgba(60,5,120,${zr.alpha * 0.25})`);
        g.addColorStop(1, 'rgba(0,0,30,0)');
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        // 网格纹理——二维化特征
        ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.clip();
        const gs = 16;
        ctx.strokeStyle = `rgba(220,200,255,${zr.alpha * 0.18 * pulse})`; ctx.lineWidth = 0.8;
        for (let gx = sx - r + ((sx - r) % gs + gs) % gs; gx < sx + r; gx += gs) {
          ctx.beginPath(); ctx.moveTo(gx, sy - r); ctx.lineTo(gx, sy + r); ctx.stroke();
        }
        for (let gy = sy - r + ((sy - r) % gs + gs) % gs; gy < sy + r; gy += gs) {
          ctx.beginPath(); ctx.moveTo(sx - r, gy); ctx.lineTo(sx + r, gy); ctx.stroke();
        }
        ctx.restore();
        // 脉冲边界
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220,180,255,${zr.alpha * 0.6 * pulse})`; ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 12]); ctx.stroke(); ctx.setLineDash([]);
      }});
    }

    // 连线
    for (const link of links) {
      const [fx, fy, fz] = this.camera.project(link.fromX, link.fromY, link.fromZ);
      const [tx, ty, tz] = this.camera.project(link.toX, link.toY, link.toZ);
      const az = (fz + tz) / 2; if (az < 3) continue;
      items.push({ z: az, draw: () => this.drawLink(fx, fy, tx, ty, link) });
    }

    // 文明 + 母星连线
    let hovered: CivRenderData | null = null;
    const civProj: Array<{ civ: CivRenderData; sx: number; sy: number; sz: number; sr: number }> = [];
    for (const civ of civs) {
      if (!civ.alive) continue;
      if (!this.camera.isVisible(civ.x, civ.y, civ.z, civ.radius)) continue;
      const [sx, sy, sz] = this.camera.project(civ.x, civ.y, civ.z);
      if (sz < 3) continue;
      const f = 700 / Math.max(1, sz); const sr = Math.max(1.5, civ.radius * f * 0.25);
      civProj.push({ civ, sx, sy, sz, sr });

      // 母星连线（跳过原点——未设置母星的文明）
      const hasHome = civ.homeStarX !== 0 || civ.homeStarY !== 0 || civ.homeStarZ !== 0;
      if (hasHome && sz < 5000) {
        const [hsx, hsy, hsz] = this.camera.project(civ.homeStarX, civ.homeStarY, civ.homeStarZ);
        if (hsz > 3 && hsx > -10000 && hsy > -10000) {
          const dist = Math.sqrt((sx-hsx)**2 + (sy-hsy)**2);
          const alpha = sz < 1500 ? 0.55 : sz < 3000 ? 0.35 : 0.16;
          items.push({ z: (sz + hsz) / 2, draw: () => {
            const ctx = this.ctx;
            // 外层光晕——粗发光
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hsx, hsy);
            ctx.strokeStyle = `rgba(160,200,255,${alpha * 0.35})`; ctx.lineWidth = 4;
            ctx.stroke();
            // 中间层
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hsx, hsy);
            ctx.strokeStyle = `rgba(200,225,255,${alpha * 0.5})`; ctx.lineWidth = 2;
            ctx.stroke();
            // 实心内线
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hsx, hsy);
            ctx.strokeStyle = `rgba(240,245,255,${alpha})`; ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 6]); ctx.stroke(); ctx.setLineDash([]);
          }});
        }

        // 殖民地小点 + 连线
        if (civ.colonyPositions && civ.colonyPositions.length > 1 && sz < 4000) {
          for (const cp of civ.colonyPositions) {
            if (cp.isCapital) continue;
            const [cpx, cpy, cpz] = this.camera.project(cp.x, cp.y, cp.z);
            if (cpz < 3) continue;
            const ca = sz < 1500 ? 0.35 : sz < 3000 ? 0.2 : 0.1;
            // 殖民地小蓝点
            items.push({ z: cpz, draw: () => {
              const cr = Math.max(2, f * 0.08);
              ctx.beginPath(); ctx.arc(cpx, cpy, cr, 0, Math.PI*2);
              ctx.fillStyle = `rgba(200,200,255,${ca + 0.3})`; ctx.fill();
            }});
            // 殖民地→首都虚线
            items.push({ z: (sz + cpz) / 2, draw: () => {
              ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cpx, cpy);
              ctx.strokeStyle = `rgba(180,200,240,${ca})`; ctx.lineWidth = 0.8;
              ctx.setLineDash([3, 8]); ctx.stroke(); ctx.setLineDash([]);
            }});
          }
        }
      }
    }
    civProj.sort((a, b) => b.sz - a.sz);
    for (const cp of civProj) {
      items.push({ z: cp.sz, draw: () => this.drawCiv(cp) });
      const dx = this.mx - cp.sx, dy = this.my - cp.sy;
      if (Math.sqrt(dx * dx + dy * dy) < cp.sr + 4) {
        if (!hovered || cp.sz < (civProj.find(c => c.civ.id === hovered!.id)?.sz ?? Infinity)) hovered = cp.civ;
      }
    }

    // 闪光
    for (const fl of this.flashes) {
      const [sx, sy, sz] = this.camera.project(fl.x, fl.y, fl.z);
      if (sz < 3) continue;
      items.push({ z: sz, draw: () => this.drawFlash(sx, sy, fl) });
    }

    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    // 射线瞄准 + 十字光标
    if (document.pointerLockElement === this.canvas) {
      this.aimedTarget = this.camera.castRay(this.starSystems, civs);

      // 轨道：锁定目标优先，否则跟随十字瞄准
      this.selectedSystemId = this.lockedTarget?.type === 'star' ? this.lockedTarget.id
        : this.aimedTarget?.type === 'star' ? this.aimedTarget.id : null;

      const cx = w / 2, cy = h / 2;
      const crossLen = 12, gap = 4;
      const hit = !!this.aimedTarget;
      ctx.strokeStyle = hit ? 'rgba(100,255,180,0.85)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = hit ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(cx, cy - gap); ctx.lineTo(cx, cy - crossLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + crossLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - gap, cy); ctx.lineTo(cx - crossLen, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + crossLen, cy); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, hit ? 2.5 : 2, 0, Math.PI * 2);
      ctx.strokeStyle = hit ? 'rgba(100,255,180,0.95)' : 'rgba(255,255,255,0.7)';
      ctx.stroke();

      // 瞄准目标信息浮窗
      if (this.aimedTarget) {
        const labelY = cy + crossLen + 16;
        ctx.fillStyle = 'rgba(100,255,180,0.9)';
        ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.aimedTarget.name, cx, labelY);

        // 查找更多信息
        let subInfo = '';
        if (this.aimedTarget.type === 'star') {
          const sys = this.starSystems.find(s => s.id === this.aimedTarget!.id);
          if (sys) {
            subInfo = `${sys.starType} | ${sys.planets.length}行星 | ${sys.planets.filter(p=>p.occupied).length}文明`;
          }
        } else {
          const civ = civs.find(c => c.id === this.aimedTarget!.id);
          if (civ) {
            subInfo = `科技${civ.techLevel.toFixed(0)} | 武器${civ.weaponLevel.toFixed(0)} | ${civ.isHiding?'隐藏中':'活跃'}`;
          }
        }
        if (subInfo) {
          ctx.fillStyle = 'rgba(200,220,200,0.65)';
          ctx.font = '9px "Microsoft YaHei", sans-serif';
          ctx.fillText(subInfo, cx, labelY + 14);
        }
      }
      // 锁定目标详情面板（左上角）
      if (this.lockedTarget) {
        const lx = 12, ly = 14;
        const lt = this.lockedTarget;
        let lines: string[] = [];
        lines.push(`🔒 ${lt.name}`);
        if (lt.type === 'star') {
          const sys = this.starSystems.find(s => s.id === lt.id);
          if (sys) {
            const spec = ['red_dwarf','yellow_dwarf','blue_giant','white_dwarf','neutron','black_hole'];
            const specNames = ['红矮星','黄矮星','蓝巨星','白矮星','中子星','黑洞'];
            const si = spec.indexOf(sys.starType);
            lines.push(`${specNames[si] || sys.starType} | 半径${sys.starSize.toFixed(1)} | 质量—`);
            lines.push(`${sys.planets.length}颗行星 | ${sys.planets.filter(p=>p.occupied).length}个文明`);
            if (sys.inBlackDomain) lines.push('🌑 黑域中——绝对安全声明');
            else if (sys.inDualVectorZone) lines.push('📐 已被二向箔二维化');
            if (sys.destroyed) lines.push(`💥 ${sys.destroyCause || '已摧毁'} @T${sys.destroyedAt}`);
          }
        } else {
          const civ = civs.find(c => c.id === lt.id);
          if (civ) {
            lines.push(`${civ.generation==='ancient'?'◆古老':civ.generation==='elder'?'◇长者':civ.generation==='mature'?'成熟':'年轻'}`);
            const colCount = civ.colonyPositions?.length || 1;
            lines.push(`科技${civ.techLevel.toFixed(1)} | 武器${civ.weaponLevel.toFixed(1)} | 人口${Math.floor(civ.population || 0)}`);
            lines.push(`殖民地${colCount} | 掌控${civ.controlRadius.toFixed(0)} | 探测${civ.detectionRadius.toFixed(0)}`);
            const ss = []; if (!civ.alive) ss.push('💀已灭'); else if (civ.inBlackDomain) ss.push('🌑黑域(停滞)'); else if (civ.atWar) ss.push('⚔️交战'); else if (civ.isHiding) ss.push('🫥隐藏'); else ss.push('🌐活跃');
            lines.push(ss.join(' '));
            if (!civ.alive && civ.causeOfDeath) lines.push(`死因: ${civ.causeOfDeath}`);
          }
        }
        lines.push('右键取消 | 单击切换锁定');
        // 背景
        const boxW = 250, boxH = lines.length * 16 + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(lx, ly, boxW, boxH);
        ctx.strokeStyle = 'rgba(100,255,180,0.5)';
        ctx.strokeRect(lx, ly, boxW, boxH);
        ctx.textAlign = 'left';
        for (let i = 0; i < lines.length; i++) {
          ctx.fillStyle = i === 0 ? 'rgba(100,255,180,0.9)' : 'rgba(200,220,200,0.7)';
          ctx.font = i === 0 ? 'bold 12px "Microsoft YaHei", sans-serif' : '10px "Microsoft YaHei", sans-serif';
          ctx.fillText(lines[i], lx + 6, ly + 16 + i * 16);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('单击十字准星目标以锁定 | 右键取消', 12, h - 16);
      }
    } else {
      this.aimedTarget = null;
      this.selectedSystemId = null;
      this.lockedTarget = null;
    }

    this.flashes = this.flashes.filter(f => { f.t++; return f.t <= f.max; });

    return { hovered };
  }

  // ---- 点击检测 ----
  getClickedCiv(civs: CivRenderData[], ex: number, ey: number): CivRenderData | null {
    const alive = civs.filter(c => c.alive);
    const proj: Array<{ civ: CivRenderData; sx: number; sy: number; sz: number; sr: number }> = [];
    for (const civ of alive) {
      const [sx, sy, sz] = this.camera.project(civ.x, civ.y, civ.z);
      if (sz < 3) continue;
      const f = 700 / Math.max(1, sz); const sr = Math.max(1.5, civ.radius * f * 0.25);
      proj.push({ civ, sx, sy, sz, sr });
    }
    proj.sort((a, b) => a.sz - b.sz);
    for (const cp of proj) {
      const dx = ex - cp.sx, dy = ey - cp.sy;
      if (Math.sqrt(dx * dx + dy * dy) < cp.sr + 6) return cp.civ;
    }
    return null;
  }

  private cw(): number { return this.canvas.width / (window.devicePixelRatio || 1); }
  private ch(): number { return this.canvas.height / (window.devicePixelRatio || 1); }

  /** 检测双击的恒星——传入事件坐标 */
  getClickedStar(ex: number, ey: number): import('./types').StarRenderData | null {
    for (const sys of this.starSystems) {
      const [sx, sy, sz] = this.camera.project(sys.x, sys.y, sys.z);
      if (sz < 3) continue;
      const f = 700 / Math.max(1, sz);
      const r = sys.starSize * f * 0.28 * 4;
      const dx = ex - sx, dy = ey - sy;
      if (Math.sqrt(dx * dx + dy * dy) < r + 6) {
        return {
          id: sys.id, name: sys.name,
          x: sys.x, y: sys.y, z: sys.z,
          starType: sys.starType,
          destroyed: sys.destroyed,
          destroyCause: sys.destroyCause,
          destroyedAt: sys.destroyedAt,
          inBlackDomain: sys.inBlackDomain,
          inDualVectorZone: sys.inDualVectorZone,
          starSize: sys.starSize, starColor: sys.starColor,
          planetCount: sys.planets.length,
          occupiedPlanetCount: sys.planets.filter(p => p.occupied).length,
        };
      }
    }
    return null;
  }

  focusOn(wx: number, wy: number, wz: number): void { this.camera.focusOn(wx, wy, wz); }

  // ---- 绘制 ----
  private drawDeepSpace(w: number, h: number): void {
    const ctx = this.ctx;
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#06080f'); bg.addColorStop(0.5, '#030510'); bg.addColorStop(1, '#010208');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const px = ((i * 7919 + 42 * 31) % w + w) % w, py = ((i * 6271 + 42 * 17) % h + h) % h;
      ctx.globalAlpha = 0.15 + 0.1 * ((i * 3571) % 100) / 100;
      ctx.fillStyle = i % 11 === 0 ? '#aaccff' : i % 13 === 0 ? '#ffddcc' : '#ffffff';
      ctx.fillRect(px, py, (i % 7 === 0) ? 1.0 : 0.4, (i % 7 === 0) ? 1.0 : 0.4);
    }
    ctx.globalAlpha = 1;
  }

  private drawStar(sys: StarSystem, sx: number, sy: number, sz: number): void {
    if (sys.destroyed) return;
    const ctx = this.ctx, f = 700 / Math.max(1, sz), r = sys.starSize * f * 0.28;
    const g = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 4);
    const c = sys.starColor;
    g.addColorStop(0, c); g.addColorStop(0.3, hexA(c, 0.4));
    g.addColorStop(0.7, hexA(c, 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(sx, sy, r * 4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // 核心——颜色随恒星类型，不过曝
    const coreAlpha = Math.min(1, r / 3);
    const coreG = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    coreG.addColorStop(0, `rgba(255,255,255,${coreAlpha})`);
    coreG.addColorStop(0.5, hexA(sys.starColor, 0.6));
    coreG.addColorStop(1, hexA(sys.starColor, 0.1));
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = coreG; ctx.fill();
    if (sz < 800) {
      const fontSize = sz < 200 ? 9 : 7;
      const na = sz < 200 ? 0.5 : 0.3;
      ctx.fillStyle = `rgba(255,255,255,${na})`;
      ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(sys.name, sx, sy - r * 4 - 4);
      // 黑域/二向箔标签
      if (sys.inBlackDomain) {
        ctx.fillStyle = `rgba(100,150,255,${na + 0.2})`;
        ctx.fillText('🌑黑域', sx, sy - r * 4 - 16);
      } else if (sys.inDualVectorZone) {
        ctx.fillStyle = `rgba(220,150,255,${na + 0.2})`;
        ctx.fillText('📐二维化', sx, sy - r * 4 - 16);
      }
    }
  }

  private drawPlanet(pl: Planet, px: number, py: number, pz: number): void {
    const ctx = this.ctx, f = 700 / Math.max(1, pz), r = Math.max(0.6, pl.size * f * 0.1);
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = pl.occupied ? '#58a6ff' : pl.habitability > 0.6 ? '#3fb950' : pl.habitability > 0.3 ? '#d29922' : '#8b949e';
    ctx.fill();
  }

  private drawLink(fx: number, fy: number, tx: number, ty: number, link: RenderLink): void {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
    if (link.type === 'dual_vector') { ctx.strokeStyle = `rgba(200,100,255,${link.alpha})`; ctx.lineWidth = 1.8; ctx.setLineDash([8, 4]); }
    else if (link.type === 'photoid') { ctx.strokeStyle = `rgba(255,107,53,${link.alpha})`; ctx.lineWidth = 1.6; ctx.setLineDash([5, 3]); }
    else if (link.type === 'spell') { const p = 0.5 + 0.5 * Math.sin(this.frame * 0.15); ctx.strokeStyle = `rgba(100,200,255,${link.alpha * p})`; ctx.lineWidth = 1.3; ctx.setLineDash([10, 5]); }
    else if (link.type === 'war') { const p = 0.5 + 0.5 * Math.sin(this.frame * 0.2); ctx.strokeStyle = `rgba(255,50,50,${link.alpha * p})`; ctx.lineWidth = 2; ctx.setLineDash([3, 2]); }
    else { ctx.strokeStyle = `rgba(210,153,34,${0.08 + link.progress * 0.4})`; ctx.lineWidth = 0.4; ctx.setLineDash([1, 6]); }
    ctx.stroke(); ctx.setLineDash([]);
  }

  private drawCiv(cp: { civ: CivRenderData; sx: number; sy: number; sz: number; sr: number }): void {
    const { civ, sx, sy, sz, sr } = cp;
    const ctx = this.ctx, f = 700 / Math.max(1, sz);
    const detR = civ.detectionRadius * f * 0.22;
    if (detR > sr * 2.5 && sz < 4000) {
      ctx.beginPath(); ctx.arc(sx, sy, detR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,140,200,0.04)'; ctx.lineWidth = 0.4; ctx.setLineDash([1, 14]); ctx.stroke(); ctx.setLineDash([]);
    }
    const ctrlR = civ.controlRadius * f * 0.22;
    if (ctrlR > sr * 1.5) {
      const ca = sz < 1500 ? 0.12 : sz < 3000 ? 0.06 : 0.03;
      ctx.beginPath(); ctx.arc(sx, sy, ctrlR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${ca * 0.3})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${ca})`; ctx.lineWidth = sz < 1000 ? 1.2 : 0.5;
      ctx.setLineDash([2, 10]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (civ.atWar) { const wr = sr * 2.4, p = 0.35 + 0.35 * Math.sin(this.frame * 0.18); ctx.beginPath(); ctx.arc(sx, sy, wr, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,35,35,${p})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
    if (civ.inBlackDomain) {
      // 灰色暗球——停滞的文明
      ctx.beginPath(); ctx.arc(sx, sy, sr * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,100,110,0.4)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 8]); ctx.stroke(); ctx.setLineDash([]);
      const g = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr * 2.5);
      g.addColorStop(0, 'rgba(60,60,70,0.5)');
      g.addColorStop(0.5, 'rgba(30,30,40,0.3)');
      g.addColorStop(1, 'rgba(10,10,15,0)');
      ctx.beginPath(); ctx.arc(sx, sy, sr * 2.5, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      // 内核——极暗灰点
      ctx.beginPath(); ctx.arc(sx, sy, sr * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,40,50,0.6)'; ctx.fill();
      if (sr > 6) {
        ctx.fillStyle = 'rgba(150,150,160,0.5)';
        ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(civ.name, sx, sy - sr * 2.5 - 4);
      }
      return;
    }
    if (civ.isBreakthrough) { const p = 1 + 0.35 * Math.sin(this.frame * 0.3); ctx.beginPath(); ctx.arc(sx, sy, sr * p * 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,215,0,0.45)'; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (civ.canDualVectorStrike) { ctx.beginPath(); ctx.arc(sx, sy, sr * 1.6, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(180,100,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 8]); ctx.stroke(); ctx.setLineDash([]); }
    else if (civ.canPhotoidStrike) { ctx.beginPath(); ctx.arc(sx, sy, sr * 1.35, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,107,53,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]); }
    const alpha = civ.isHiding ? 0.28 : 0.85;
    const g = ctx.createRadialGradient(sx, sy, sr * 0.05, sx, sy, sr), bc = civ.color;
    g.addColorStop(0, lighten(bc, 0.5)); g.addColorStop(0.55, bc); g.addColorStop(1, darken(bc, 0.8));
    ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = lighten(bc, 0.3); ctx.lineWidth = civ.generation === 'ancient' ? 2 : civ.generation === 'elder' ? 1.3 : 0.7; ctx.stroke();
    if (civ.signalStrength > 0.2) { const sr2 = sr * (1 + civ.signalStrength * 0.3); ctx.beginPath(); ctx.arc(sx, sy, sr2, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.4, civ.signalStrength * 0.15)})`; ctx.lineWidth = 0.6; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // 固定大小名称标签（仅近处显示）
    if (sr > 5 && sz < 2500) {
      const labelSize = 10;
      ctx.fillStyle = 'rgba(220,225,235,0.85)';
      ctx.font = `600 ${labelSize}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(civ.name, sx, sy - sr - 5);
    }
  }

  private drawFlash(sx: number, sy: number, fl: { t: number; max: number; color: string }): void {
    const ctx = this.ctx, p = fl.t / fl.max, a = 1 - p, r = 5 + p * 50;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, fl.color); g.addColorStop(0.35, `rgba(255,200,50,${a * 0.8})`); g.addColorStop(1, 'rgba(255,20,0,0)');
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  }
}

// 工具
function hexA(h: string, a: number): string { const [r, g, b] = h2r(h); return `rgba(${r},${g},${b},${a})`; }
function lighten(h: string, a: number): string { const [r, g, b] = h2r(h); return `rgb(${Math.min(255, r + (255 - r) * a)},${Math.min(255, g + (255 - g) * a)},${Math.min(255, b + (255 - b) * a)})`; }
function darken(h: string, a: number): string { const [r, g, b] = h2r(h); return `rgb(${Math.floor(r * (1 - a))},${Math.floor(g * (1 - a))},${Math.floor(b * (1 - a))})`; }
function h2r(h: string): [number, number, number] { const m = h.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128]; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

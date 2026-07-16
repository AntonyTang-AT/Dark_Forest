// ============================================================
// 黑暗森林模拟器 — UI 控制
// Dark Forest Simulator — UI Controls
// ============================================================

import type { SimEvent, CivRenderData } from './types';
import { SCENARIOS } from './config';

export interface UICallbacks {
  onPauseToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onStep: () => void;
  onReset: () => void;
  onPresetSelect: (presetKey: string) => void;
  onParamChange: (key: string, value: number) => void;
}

/**
 * UI 管理器：连接 HTML 控件与模拟逻辑。
 */
export class UIManager {
  private callbacks: UICallbacks;
  private paused: boolean = false;
  private speed: number = 1;

  // DOM 引用
  private btnPause: HTMLButtonElement;
  private speedLabel: HTMLElement;
  private tickNum: HTMLElement;
  private aliveNum: HTMLElement;
  private speedNum: HTMLElement;
  private eventLog: HTMLElement;
  private tooltip: HTMLElement;
  private statAlive: HTMLElement;
  private statDead: HTMLElement;
  private statAttacks: HTMLElement;
  private statDetections: HTMLElement;
  private statTech: HTMLElement;

  private rangeCount: HTMLInputElement;
  private rangeResource: HTMLInputElement;
  private rangeDetection: HTMLInputElement;
  private valCount: HTMLElement;
  private valResource: HTMLElement;
  private valDetection: HTMLElement;
  private presetSelect: HTMLSelectElement;

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;

    // 获取所有 DOM 引用
    this.btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
    this.speedLabel = document.getElementById('speed-label')!;
    this.tickNum = document.getElementById('tick-num')!;
    this.aliveNum = document.getElementById('alive-num')!;
    this.speedNum = document.getElementById('speed-num')!;
    this.eventLog = document.getElementById('event-log')!;
    this.tooltip = document.getElementById('tooltip')!;
    this.statAlive = document.getElementById('stat-alive')!;
    this.statDead = document.getElementById('stat-dead')!;
    this.statAttacks = document.getElementById('stat-attacks')!;
    this.statDetections = document.getElementById('stat-detections')!;
    this.statTech = document.getElementById('stat-tech')!;

    this.rangeCount = document.getElementById('range-count') as HTMLInputElement;
    this.rangeResource = document.getElementById('range-resource') as HTMLInputElement;
    this.rangeDetection = document.getElementById('range-detection') as HTMLInputElement;
    this.valCount = document.getElementById('val-count')!;
    this.valResource = document.getElementById('val-resource')!;
    this.valDetection = document.getElementById('val-detection')!;
    this.presetSelect = document.getElementById('preset-select') as HTMLSelectElement;

    this.setupListeners();
  }

  private setupListeners(): void {
    // 播放/暂停
    this.btnPause.addEventListener('click', () => {
      this.paused = !this.paused;
      this.btnPause.textContent = this.paused ? '▶️ 播放' : '⏯️ 暂停';
      this.btnPause.classList.toggle('active', !this.paused);
      this.callbacks.onPauseToggle();
    });

    // 速度控制
    document.getElementById('btn-slower')!.addEventListener('click', () => {
      this.setSpeed(Math.max(0.25, this.speed / 2));
    });
    document.getElementById('btn-faster')!.addEventListener('click', () => {
      this.setSpeed(Math.min(10, this.speed * 2));
    });

    // 单步
    document.getElementById('btn-step')!.addEventListener('click', () => {
      this.callbacks.onStep();
    });

    // 重置
    document.getElementById('btn-reset')!.addEventListener('click', () => {
      this.callbacks.onReset();
    });

    // 参数滑块
    this.rangeCount.addEventListener('input', () => {
      const v = parseInt(this.rangeCount.value);
      this.valCount.textContent = String(v);
      this.callbacks.onParamChange('civCount', v);
    });
    this.rangeResource.addEventListener('input', () => {
      const v = parseInt(this.rangeResource.value);
      this.valResource.textContent = String(v);
      this.callbacks.onParamChange('resourceAbundance', v / 100);
    });
    this.rangeDetection.addEventListener('input', () => {
      const v = parseInt(this.rangeDetection.value);
      this.valDetection.textContent = String(v);
      this.callbacks.onParamChange('detectionEfficiency', v / 100);
    });

    // 预设场景
    this.presetSelect.addEventListener('change', () => {
      const key = this.presetSelect.value;
      if (!key) return;
      this.callbacks.onPresetSelect(key);
      // 更新滑块以反映预设值
      const preset = SCENARIOS[key];
      if (preset) {
        this.rangeCount.value = String(preset.civCount);
        this.valCount.textContent = String(preset.civCount);
        this.rangeResource.value = String(Math.round(preset.resourceAbundance * 100));
        this.valResource.textContent = String(Math.round(preset.resourceAbundance * 100));
        this.rangeDetection.value = String(Math.round(preset.detectionEfficiency * 100));
        this.valDetection.textContent = String(Math.round(preset.detectionEfficiency * 100));
      }
      this.presetSelect.value = ''; // 重置选择框
    });

    // 键盘快捷键
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.btnPause.click();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.callbacks.onStep();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setSpeed(Math.min(10, this.speed * 2));
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setSpeed(Math.max(0.25, this.speed / 2));
          break;
      }
    });
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.speedLabel.textContent = `${speed}×`;
    this.speedNum.textContent = `${speed}×`;
    this.callbacks.onSpeedChange(speed);
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSpeed(): number {
    return this.speed;
  }

  /** 更新顶部统计数字 */
  updateStats(
    tick: number,
    aliveCount: number,
    totalDeaths: number,
    totalStrikes: number,
    totalDetections: number,
    avgTech: number,
    photoidStrikes: number,
    dualVectorStrikes: number,
    blackDomains: number,
    civsInBlackDomain: number,
  ): void {
    this.tickNum.textContent = String(tick);
    this.aliveNum.textContent = String(aliveCount);
    this.statAlive.textContent = String(aliveCount);
    this.statDead.textContent = String(totalDeaths);
    this.statAttacks.textContent = `${totalStrikes} (光粒${photoidStrikes}/二向箔${dualVectorStrikes})`;
    this.statDetections.textContent = `${totalDetections} | 黑域${blackDomains}(${civsInBlackDomain}活)`;
    this.statTech.textContent = avgTech.toFixed(1);
  }

  /** 添加事件到日志 */
  addEvent(event: SimEvent): void {
    const div = document.createElement('div');
    div.className = 'event-line';

    let icon = '';
    let cssClass = '';
    switch (event.type) {
      case 'photoid_strike': icon = '☀️'; cssClass = 'event-attack'; break;
      case 'dual_vector_foil': icon = '📐'; cssClass = 'event-attack'; break;
      case 'tracking': icon = '🎯'; cssClass = 'event-detect'; break;
      case 'detection': icon = '👁️'; cssClass = 'event-detect'; break;
      case 'death': icon = '💀'; cssClass = 'event-death'; break;
      case 'broadcast': icon = '📡'; cssClass = 'event-detect'; break;
      case 'black_domain': icon = '🌑'; cssClass = ''; break;
      case 'spell': icon = '🪄'; cssClass = 'event-detect'; break;
      case 'fugitive': icon = '🚀'; cssClass = 'event-birth'; break;
      case 'birth': icon = '🌟'; cssClass = 'event-birth'; break;
      case 'hiding': icon = '🫥'; cssClass = ''; break;
      case 'breakthrough': icon = '💡'; cssClass = 'event-birth'; break;
    }

    div.innerHTML = `<span class="event-tick">[${event.tick}]</span><span class="${cssClass}">${icon} ${event.detail || ''}</span>`;
    this.eventLog.appendChild(div);

    // 限制日志条数
    while (this.eventLog.children.length > 100) {
      this.eventLog.removeChild(this.eventLog.firstChild!);
    }
    this.eventLog.scrollTop = this.eventLog.scrollHeight;
  }

  /** 显示/更新 Tooltip */
  updateTooltip(civ: CivRenderData | null): void {
    if (!civ) {
      this.tooltip.style.display = 'none';
      return;
    }

    const container = document.getElementById('canvas-container')!;
    const rect = container.getBoundingClientRect();
    const [sx, sy] = [0, 0]; // 由 renderer 提供坐标

    this.tooltip.innerHTML = `
      <div class="tt-name" style="color:${civ.color}">${civ.name}${civ.isFugitive ? ' [逃亡者]' : ''}</div>
      <div class="tt-row"><span class="tt-label">世代</span><span class="tt-val">${civ.generation === 'ancient' ? '◆ 古老' : civ.generation === 'elder' ? '◇ 长者' : civ.generation === 'mature' ? '成熟' : '年轻'}${civ.isFugitive ? ' → 逃亡' : ''}</span></div>
      <div class="tt-row"><span class="tt-label">科技/武器</span><span class="tt-val">${civ.techLevel.toFixed(1)} / ${civ.weaponLevel.toFixed(1)}</span></div>
      <div class="tt-row"><span class="tt-label">掌控/探测范围</span><span class="tt-val">${civ.controlRadius.toFixed(0)} / ${civ.detectionRadius.toFixed(0)}</span></div>
      <div class="tt-row"><span class="tt-label">信号强度</span><span class="tt-val">${civ.signalStrength.toFixed(2)}</span></div>
      <div class="tt-row"><span class="tt-label">状态</span><span class="tt-val">${civ.inBlackDomain ? '🌑 黑域' : civ.isHiding ? '🫥 隐藏' : civ.hasActiveSpell ? '🪄 咒语中' : civ.canDualVectorStrike ? '💜 二向箔' : civ.canPhotoidStrike ? '🧡 光粒' : '🌐 活跃'}${civ.isBreakthrough ? ' 💡' : ''}</span></div>
      <div class="tt-row"><span class="tt-label">策略</span><span class="tt-val">攻${civ.strategy.aggression.toFixed(1)} 慎${civ.strategy.caution.toFixed(1)} 合${civ.strategy.cooperation.toFixed(1)}</span></div>
    `;
    this.tooltip.style.display = 'block';
  }

  hideTooltip(): void {
    this.tooltip.style.display = 'none';
  }
}

// ---- 在 renderer 的 mousemove 中调用这个来定位 tooltip ----
export function positionTooltip(e: MouseEvent): void {
  const tooltip = document.getElementById('tooltip')!;
  const container = document.getElementById('canvas-container')!;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left + 15;
  const y = e.clientY - rect.top + 15;

  // 防止溢出
  const maxX = rect.width - 270;
  const maxY = rect.height - 150;
  tooltip.style.left = `${Math.min(x, maxX)}px`;
  tooltip.style.top = `${Math.min(y, maxY)}px`;
}

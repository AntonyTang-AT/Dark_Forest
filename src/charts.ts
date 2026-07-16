// ============================================================
// 黑暗森林模拟器 — 统计图表
// Dark Forest Simulator — Charts (Chart.js)
// ============================================================

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// 注册 Chart.js 组件
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

/** 暗色主题配色 */
const CHART_COLORS = {
  alive: '#3fb950',
  dead: '#f85149',
  attacks: '#d29922',
  detections: '#58a6ff',
  grid: '#21262d',
  text: '#8b949e',
};

/**
 * 管理所有统计图表。
 */
export class ChartManager {
  private popChart: Chart<'line'>;
  private deathChart: Chart<'doughnut'>;

  private popData: number[] = [];      // 每 N tick 记录一次存活数
  private popLabels: number[] = [];    // 对应的 tick

  constructor() {
    this.popChart = this.createPopulationChart();
    this.deathChart = this.createDeathCausesChart();
  }

  /** 文明数量折线图 */
  private createPopulationChart(): Chart<'line'> {
    const canvas = document.getElementById('chart-population') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: '存活文明',
            data: [],
            borderColor: CHART_COLORS.alive,
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 1.5,
          },
          {
            label: '累计灭绝',
            data: [],
            borderColor: CHART_COLORS.dead,
            backgroundColor: 'rgba(248, 81, 73, 0.05)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: {
            labels: { color: CHART_COLORS.text, font: { size: 10 }, boxWidth: 12 },
            position: 'top',
          },
        },
        scales: {
          x: {
            ticks: { color: CHART_COLORS.text, font: { size: 9 }, maxTicksLimit: 6 },
            grid: { color: CHART_COLORS.grid },
          },
          y: {
            ticks: { color: CHART_COLORS.text, font: { size: 9 }, maxTicksLimit: 5 },
            grid: { color: CHART_COLORS.grid },
            min: 0,
          },
        },
      },
    });
  }

  /** 灭绝原因饼图 */
  private createDeathCausesChart(): Chart<'doughnut'> {
    const canvas = document.getElementById('chart-death-causes') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['光粒/二向箔', '星际战争', '资源枯竭', '内部崩溃', '黑域消亡', '其他'],
        datasets: [{
          data: [0, 0, 0, 0, 0, 0],
          backgroundColor: [
            '#f85149',
            '#ff6b35',
            '#d29922',
            '#bc8cff',
            '#484f80',
            '#484f58',
          ],
          borderColor: '#0d1117',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        plugins: {
          legend: {
            labels: { color: CHART_COLORS.text, font: { size: 10 }, boxWidth: 10 },
            position: 'bottom',
          },
        },
      },
    });
  }

  /** 每 N tick 更新一次数据（避免数据点过多） */
  update(
    tick: number,
    aliveCount: number,
    totalDeaths: number,
    deathsByCause: Record<string, number>,
  ): void {
    // 每 10 tick 记录一个数据点
    if (tick % 10 === 0) {
      this.popLabels.push(tick);
      this.popData.push(aliveCount);

      // 保留最近 300 个点
      if (this.popLabels.length > 300) {
        this.popLabels = this.popLabels.slice(-300);
        this.popData = this.popData.slice(-300);
      }

      this.popChart.data.labels = this.popLabels.map(String);
      this.popChart.data.datasets[0].data = this.popData;
      // 累计灭绝 = 初始文明数 - 当前存活数 + 追踪不到的死因
      this.popChart.data.datasets[1].data = this.popData.map(
        () => totalDeaths,
      );
      this.popChart.update('none');
    }

    // 每 20 tick 更新饼图（首次 tick=1 也更新）
    if (tick % 20 === 0 || tick === 1) {
      // 聚合死亡原因到饼图分类
      const photoidTotal = deathsByCause['光粒打击'] || 0;
      const dualVectorTotal = (deathsByCause['二向箔打击'] || 0) +
        (deathsByCause['二向箔波及'] || 0) +
        (deathsByCause['二向箔扩散'] || 0);
      const warTotal = deathsByCause['星际战争败亡'] || 0;
      const disasterTotal = (deathsByCause['超新星爆发'] || 0) +
        (deathsByCause['红巨星吞噬'] || 0) +
        (deathsByCause['伽马射线暴'] || 0) +
        (deathsByCause['超新星冲击波'] || 0);
      const resourceTotal = deathsByCause['资源枯竭'] || 0;
      const collapseTotal = deathsByCause['内部崩溃'] || 0;
      const blackDomainTotal = deathsByCause['黑域中消亡'] || 0;
      const otherTotal = totalDeaths - photoidTotal - dualVectorTotal - warTotal - disasterTotal - resourceTotal - collapseTotal - blackDomainTotal;

      this.deathChart.data.datasets[0].data = [
        photoidTotal, dualVectorTotal, warTotal, disasterTotal,
        resourceTotal, collapseTotal, blackDomainTotal, Math.max(0, otherTotal),
      ];
      this.deathChart.data.labels = [
        '光粒打击', '降维打击(二向箔)', '星际战争', '宇宙灾难',
        '资源枯竭', '内部崩溃', '黑域消亡', '其他',
      ];
      this.deathChart.update('none');
    }
  }

  /** 销毁所有图表 */
  destroy(): void {
    this.popChart.destroy();
    this.deathChart.destroy();
  }
}

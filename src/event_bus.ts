// ============================================================
// 黑暗森林模拟器 — 事件总线
// Dark Forest Simulator — Event Bus
// ============================================================

import type { SimEvent } from './types';

type EventHandler = (event: SimEvent) => void;

/**
 * 轻量级事件总线，用于解耦模拟引擎与 UI/渲染层。
 * 模拟引擎通过 emit 广播事件，UI 通过 on 订阅。
 */
export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private eventLog: SimEvent[] = [];
  private maxLogSize: number;

  constructor(maxLogSize = 200) {
    this.maxLogSize = maxLogSize;
  }

  /** 订阅某个事件类型 */
  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /** 取消订阅 */
  off(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  /** 发布事件 */
  emit(event: SimEvent): void {
    // 记录日志
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // 通知所有订阅了此类型的处理器
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch (e) {
          console.error(`EventBus: handler error for ${event.type}:`, e);
        }
      }
    }

    // 通知 '*' 通配符订阅者
    const allHandlers = this.handlers.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(event);
        } catch (e) {
          console.error(`EventBus: wildcard handler error:`, e);
        }
      }
    }
  }

  /** 获取最近的事件日志 */
  getRecentEvents(count = 50): SimEvent[] {
    return this.eventLog.slice(-count);
  }

  /** 获取所有事件 */
  getAllEvents(): SimEvent[] {
    return [...this.eventLog];
  }

  /** 清空事件日志 */
  clear(): void {
    this.eventLog = [];
  }

  /** 移除所有订阅 */
  destroy(): void {
    this.handlers.clear();
    this.eventLog = [];
  }
}

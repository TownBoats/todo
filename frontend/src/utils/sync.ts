import { encodeCursor, decodeCursor, type Cursor } from './cursor'

export interface SyncCursor {
  updated_at: string
  id: string
}

export interface SyncState {
  cursor?: string
  lastSyncTime?: number
  isOnline: boolean
  syncInProgress: boolean
}

// 本地存储管理
export const syncStorage = {
  getCursor: (userId: string): string | undefined => {
    const key = `sync_cursor_${userId}`
    return localStorage.getItem(key) || undefined
  },

  setCursor: (userId: string, cursor: string): void => {
    const key = `sync_cursor_${userId}`
    localStorage.setItem(key, cursor)
  },

  clearCursor: (userId: string): void => {
    const key = `sync_cursor_${userId}`
    localStorage.removeItem(key)
  },

  getLastSyncTime: (userId: string): number | undefined => {
    const key = `last_sync_${userId}`
    const value = localStorage.getItem(key)
    return value ? parseInt(value, 10) : undefined
  },

  setLastSyncTime: (userId: string, timestamp: number): void => {
    const key = `last_sync_${userId}`
    localStorage.setItem(key, timestamp.toString())
  },

  clearLastSyncTime: (userId: string): void => {
    const key = `last_sync_${userId}`
    localStorage.removeItem(key)
  },

  // 清除所有同步相关数据
  clearAllSyncData: (userId: string): void => {
    syncStorage.clearCursor(userId)
    syncStorage.clearLastSyncTime(userId)
  },

  // 获取完整的同步状态
  getSyncState: (userId: string): SyncState => {
    return {
      cursor: syncStorage.getCursor(userId),
      lastSyncTime: syncStorage.getLastSyncTime(userId),
      isOnline: navigator.onLine,
      syncInProgress: false,
    }
  },
}

// 同步配置
export const SYNC_CONFIG = {
  // 默认轮询间隔（毫秒）
  DEFAULT_POLLING_INTERVAL: 10 * 1000, // 10秒

  // 最小轮询间隔
  MIN_POLLING_INTERVAL: 5 * 1000, // 5秒

  // 最大轮询间隔
  MAX_POLLING_INTERVAL: 60 * 1000, // 60秒

  // 同步失败后的退避策略
  RETRY_DELAYS: [1_000, 2_000, 5_000, 10_000, 30_000], // 重试延迟

  // 网络状态变化后的延迟重试
  NETWORK_RECONNECT_DELAY: 2_000, // 2秒

  // 页面可见性变化后的延迟
  VISIBILITY_CHANGE_DELAY: 1_000, // 1秒
} as const

// 同步错误类型
export const SyncErrorType = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

// 同步事件类型
export const SyncEventTypeValues = {
  SYNC_STARTED: 'SYNC_STARTED',
  SYNC_COMPLETED: 'SYNC_COMPLETED',
  SYNC_FAILED: 'SYNC_FAILED',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  NETWORK_ONLINE: 'NETWORK_ONLINE',
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
} as const

// 同步事件类型定义
export type SyncEventType = typeof SyncEventTypeValues[keyof typeof SyncEventTypeValues]

// 同步事件接口
export interface SyncEvent {
  type: SyncEventType
  timestamp: number
  data?: any
  error?: Error
}

// 简单的事件发射器
export class SyncEventEmitter {
  private listeners: Map<SyncEventType, ((event: SyncEvent) => void)[]> = new Map()

  on(eventType: SyncEventType, listener: (event: SyncEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, [])
    }
    this.listeners.get(eventType)!.push(listener)
  }

  off(eventType: SyncEventType, listener: (event: SyncEvent) => void): void {
    const listeners = this.listeners.get(eventType)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  emit(event: SyncEvent): void {
    const listeners = this.listeners.get(event.type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`Error in sync event listener for ${event.type}:`, error)
        }
      })
    }
  }
}

// 全局同步事件发射器
export const syncEventEmitter = new SyncEventEmitter()

// 同步工具函数
export const syncUtils = {
  // 检查是否应该进行同步
  shouldSync: (userId: string, minInterval: number = SYNC_CONFIG.DEFAULT_POLLING_INTERVAL): boolean => {
    const lastSyncTime = syncStorage.getLastSyncTime(userId)
    if (!lastSyncTime) return true

    const now = Date.now()
    return (now - lastSyncTime) >= minInterval
  },

  // 格式化最后同步时间
  formatLastSync: (timestamp?: number): string => {
    if (!timestamp) return 'Never'

    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60_000) return 'Just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  },

  // 从日期和时间戳创建游标
  createCursorFromTimestamp: (updatedAt: string, id: string): string => {
    const cursor: Cursor = { updated_at: updatedAt, id }
    return encodeCursor(cursor)
  },

  // 解析游标获取更新时间
  getUpdatedAtFromCursor: (cursor: string): string | null => {
    const decoded = decodeCursor(cursor)
    return decoded?.updated_at || null
  },

  // 比较两个游标的时间
  compareCursorTimes: (cursor1: string, cursor2: string): number => {
    const time1 = syncUtils.getUpdatedAtFromCursor(cursor1)
    const time2 = syncUtils.getUpdatedAtFromCursor(cursor2)

    if (!time1 && !time2) return 0
    if (!time1) return -1
    if (!time2) return 1

    return new Date(time1).getTime() - new Date(time2).getTime()
  },
}
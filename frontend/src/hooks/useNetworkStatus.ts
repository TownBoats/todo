import { useState, useEffect, useCallback } from 'react'
import { syncEventEmitter, SyncEventType } from '@/utils/sync'

export interface NetworkStatus {
  isOnline: boolean
  isOffline: boolean
  reconnectAttempts: number
  lastOnlineTime?: number
  lastOfflineTime?: number
}

export interface NetworkStatusOptions {
  // 检查网络连接的URL
  checkUrl?: string
  // 检查超时时间（毫秒）
  checkTimeout?: number
  // 重连检查间隔（毫秒）
  reconnectInterval?: number
  // 最大重连尝试次数
  maxReconnectAttempts?: number
}

export function useNetworkStatus(options: NetworkStatusOptions = {}) {
  const {
    checkUrl = 'https://httpbin.org/get',
    checkTimeout = 5000,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
  } = options

  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(() => ({
    isOnline: navigator.onLine,
    isOffline: !navigator.onLine,
    reconnectAttempts: 0,
    lastOnlineTime: navigator.onLine ? Date.now() : undefined,
    lastOfflineTime: !navigator.onLine ? Date.now() : undefined,
  }))

  const [isChecking, setIsChecking] = useState(false)

  // 检查网络连接的主动检测方法
  const checkNetworkConnectivity = useCallback(async (): Promise<boolean> => {
    if (isChecking) return false

    setIsChecking(true)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), checkTimeout)

      const response = await fetch(checkUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return true
    } catch (error) {
      // 由于使用了 no-cors 模式，大部分错误是正常的
      // 主要检查请求是否能够发出
      return navigator.onLine
    } finally {
      setIsChecking(false)
    }
  }, [checkUrl, checkTimeout, isChecking])

  // 更新网络状态
  const updateNetworkStatus = useCallback(
    (isOnline: boolean) => {
      setNetworkStatus(prev => {
        // 如果状态没有变化，不需要更新
        if (prev.isOnline === isOnline) return prev

        const now = Date.now()
        const newStatus: NetworkStatus = {
          ...prev,
          isOnline,
          isOffline: !isOnline,
          lastOnlineTime: isOnline ? now : prev.lastOnlineTime,
          lastOfflineTime: !isOnline ? now : prev.lastOfflineTime,
          reconnectAttempts: isOnline ? 0 : prev.reconnectAttempts + 1,
        }

        // 发出网络状态变化事件
        syncEventEmitter.emit({
          type: isOnline ? SyncEventType.NETWORK_ONLINE : SyncEventType.NETWORK_OFFLINE,
          timestamp: now,
          data: newStatus,
        })

        return newStatus
      })
    },
    []
  )

  // 手动重连检查
  const manualReconnect = useCallback(async () => {
    const isOnline = await checkNetworkConnectivity()
    updateNetworkStatus(isOnline)
    return isOnline
  }, [checkNetworkConnectivity, updateNetworkStatus])

  // 重置重连计数
  const resetReconnectAttempts = useCallback(() => {
    setNetworkStatus(prev => ({
      ...prev,
      reconnectAttempts: 0,
    }))
  }, [])

  // 监听浏览器网络状态变化
  useEffect(() => {
    const handleOnline = () => {
      updateNetworkStatus(true)
    }

    const handleOffline = () => {
      updateNetworkStatus(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateNetworkStatus])

  // 自动重连检查（当离线时）
  useEffect(() => {
    if (!networkStatus.isOnline && networkStatus.reconnectAttempts < maxReconnectAttempts) {
      const timer = setTimeout(async () => {
        await manualReconnect()
      }, reconnectInterval * Math.min(networkStatus.reconnectAttempts + 1, 3)) // 逐渐增加间隔

      return () => clearTimeout(timer)
    }
  }, [
    networkStatus.isOnline,
    networkStatus.reconnectAttempts,
    maxReconnectAttempts,
    reconnectInterval,
    manualReconnect,
  ])

  // 页面可见性变化时检查网络状态
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        // 页面变为可见时，检查网络状态
        await manualReconnect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [manualReconnect])

  // 窗口获得焦点时检查网络状态
  useEffect(() => {
    const handleFocus = async () => {
      await manualReconnect()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [manualReconnect])

  return {
    // 网络状态
    ...networkStatus,

    // 检查状态
    isChecking,

    // 方法
    checkConnectivity: checkNetworkConnectivity,
    manualReconnect,
    resetReconnectAttempts,

    // 便捷属性
    canSync: networkStatus.isOnline && !isChecking,
    shouldRetryReconnect: !networkStatus.isOnline && networkStatus.reconnectAttempts < maxReconnectAttempts,
  }
}
import React, { useState, useEffect } from 'react'
import { useTodos } from '@/hooks/useTodos'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { syncEventEmitter, SyncEventTypeValues, syncUtils } from '@/utils/sync'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

interface SyncStatusProps {
  showManualSync?: boolean
  showDetailedStatus?: boolean
  className?: string
}

export function SyncStatus({
  showManualSync = true,
  showDetailedStatus = false,
  className = ''
}: SyncStatusProps) {
  const {
    isOnline,
    isChecking,
    reconnectAttempts,
    canSync
  } = useNetworkStatus()

  const {
    isLoading: isSyncing,
    lastSyncTime,
    error,
    manualSync,
    isMutating
  } = useTodos({ enablePolling: canSync })

  const [syncActivity, setSyncActivity] = useState<{
    type: 'idle' | 'syncing' | 'success' | 'error'
    message: string
    timestamp: number
  }>({
    type: 'idle',
    message: '',
    timestamp: Date.now(),
  })

  // 监听同步事件
  useEffect(() => {
    const handleSyncStarted = () => {
      setSyncActivity({
        type: 'syncing',
        message: 'Sync started...',
        timestamp: Date.now(),
      })
    }

    const handleSyncCompleted = (event: any) => {
      const { data } = event
      let message = 'Sync completed'

      if (data?.operation === 'create') {
        message = 'Todo created'
      } else if (data?.operation === 'update') {
        message = 'Todo updated'
      } else if (data?.operation === 'delete') {
        message = 'Todo deleted'
      } else if (data?.todosCount !== undefined) {
        message = `${data.todosCount} todos synced`
      }

      setSyncActivity({
        type: 'success',
        message,
        timestamp: Date.now(),
      })

      // 3秒后清除成功消息
      setTimeout(() => {
        setSyncActivity(prev =>
          prev.type === 'success'
            ? { type: 'idle', message: '', timestamp: Date.now() }
            : prev
        )
      }, 3000)
    }

    const handleSyncFailed = () => {
      setSyncActivity({
        type: 'error',
        message: 'Sync failed',
        timestamp: Date.now(),
      })

      // 5秒后清除错误消息
      setTimeout(() => {
        setSyncActivity(prev =>
          prev.type === 'error'
            ? { type: 'idle', message: '', timestamp: Date.now() }
            : prev
        )
      }, 5000)
    }

    syncEventEmitter.on(SyncEventTypeValues.SYNC_STARTED, handleSyncStarted)
    syncEventEmitter.on(SyncEventTypeValues.SYNC_COMPLETED, handleSyncCompleted)
    syncEventEmitter.on(SyncEventTypeValues.SYNC_FAILED, handleSyncFailed)

    return () => {
      syncEventEmitter.off(SyncEventTypeValues.SYNC_STARTED, handleSyncStarted)
      syncEventEmitter.off(SyncEventTypeValues.SYNC_COMPLETED, handleSyncCompleted)
      syncEventEmitter.off(SyncEventTypeValues.SYNC_FAILED, handleSyncFailed)
    }
  }, [])

  // 格式化最后同步时间
  const formatLastSync = (timestamp?: number) => {
    return syncUtils.formatLastSync(timestamp)
  }

  // 获取状态指示器颜色
  const getStatusColor = () => {
    if (isChecking) return 'bg-yellow-500'
    if (!isOnline) return 'bg-red-500'
    if (error || syncActivity.type === 'error') return 'bg-orange-500'
    if (isSyncing || isMutating) return 'bg-blue-500'
    return 'bg-green-500'
  }

  // 获取状态文本
  const getStatusText = () => {
    if (isChecking) return 'Checking...'
    if (!isOnline) return 'Offline'
    if (reconnectAttempts > 0) return `Reconnecting... (${reconnectAttempts})`
    if (error || syncActivity.type === 'error') return 'Sync failed'
    if (isSyncing || isMutating) return 'Syncing...'
    if (syncActivity.type === 'success') return syncActivity.message
    return `Last sync: ${formatLastSync(lastSyncTime)}`
  }

  // 处理手动同步
  const handleManualSync = () => {
    if (canSync && !isSyncing && !isMutating) {
      manualSync()
    }
  }

  // 是否显示加载动画
  const showSpinner = isSyncing || isMutating || isChecking

  return (
    <div className={`flex items-center space-x-2 text-sm ${className}`}>
      {/* 状态指示器 */}
      <div className="flex items-center space-x-1">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${
          showSpinner ? 'animate-pulse' : ''
        }`} />

        {showSpinner && (
          <LoadingSpinner size="sm" className="w-3 h-3" />
        )}

        <span className="text-gray-600">
          {getStatusText()}
        </span>
      </div>

      {/* 详细状态信息 */}
      {showDetailedStatus && (
        <div className="text-xs text-gray-500">
          <span>Network: {isOnline ? 'Online' : 'Offline'}</span>
          {reconnectAttempts > 0 && (
            <span className="ml-2">Attempts: {reconnectAttempts}</span>
          )}
          {lastSyncTime && (
            <span className="ml-2">
              at {new Date(lastSyncTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* 手动同步按钮 */}
      {showManualSync && (
        <button
          onClick={handleManualSync}
          disabled={!canSync || isSyncing || isMutating}
          className="text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={canSync ? 'Manual sync' : 'Cannot sync while offline'}
        >
          <svg
            className={`w-4 h-4 ${isSyncing || isMutating ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      )}

      {/* 错误重试提示 */}
      {(error || syncActivity.type === 'error') && canSync && (
        <button
          onClick={handleManualSync}
          className="text-red-600 hover:text-red-700 underline text-xs"
        >
          Retry
        </button>
      )}
    </div>
  )
}

// 简化版本，只显示状态指示器
export function SyncStatusIndicator({ className = '' }: { className?: string }) {
  const { isOnline, isChecking } = useNetworkStatus()
  const { isLoading: isSyncing, error } = useTodos()

  const getStatusColor = () => {
    if (isChecking) return 'bg-yellow-500'
    if (!isOnline) return 'bg-red-500'
    if (error) return 'bg-orange-500'
    if (isSyncing) return 'bg-blue-500'
    return 'bg-green-500'
  }

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${
        isSyncing || isChecking ? 'animate-pulse' : ''
      }`} />
      {isSyncing && (
        <LoadingSpinner size="sm" className="w-3 h-3" />
      )}
    </div>
  )
}
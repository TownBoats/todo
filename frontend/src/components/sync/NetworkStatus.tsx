import React, { useState, useEffect } from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { syncEventEmitter, SyncEventTypeValues } from '@/utils/sync'

interface NetworkStatusProps {
  showOnlyWhenOffline?: boolean
  showDetailedInfo?: boolean
  className?: string
  onReconnectClick?: () => void
}

export function NetworkStatus({
  showOnlyWhenOffline = true,
  showDetailedInfo = false,
  className = '',
  onReconnectClick
}: NetworkStatusProps) {
  const {
    isOnline,
    isOffline,
    isChecking,
    reconnectAttempts,
    lastOnlineTime,
    lastOfflineTime,
    canSync,
    shouldRetryReconnect,
    manualReconnect
  } = useNetworkStatus()

  const [isRetrying, setIsRetrying] = useState(false)
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)

  // 控制离线banner的显示
  useEffect(() => {
    if (isOffline) {
      // 延迟显示离线banner，避免短暂的网络波动
      const timer = setTimeout(() => {
        setShowOfflineBanner(true)
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setShowOfflineBanner(false)
    }
  }, [isOffline])

  // 监听网络状态变化事件
  useEffect(() => {
    const handleOffline = () => {
      setShowOfflineBanner(true)
    }

    const handleOnline = () => {
      setShowOfflineBanner(false)
    }

    syncEventEmitter.on(SyncEventTypeValues.NETWORK_OFFLINE, handleOffline)
    syncEventEmitter.on(SyncEventTypeValues.NETWORK_ONLINE, handleOnline)

    return () => {
      syncEventEmitter.off(SyncEventTypeValues.NETWORK_OFFLINE, handleOffline)
      syncEventEmitter.off(SyncEventTypeValues.NETWORK_ONLINE, handleOnline)
    }
  }, [])

  // 处理手动重连
  const handleManualReconnect = async () => {
    if (isRetrying) return

    setIsRetrying(true)
    try {
      if (onReconnectClick) {
        onReconnectClick()
      } else {
        await manualReconnect()
      }
    } finally {
      setIsRetrying(false)
    }
  }

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleTimeString()
  }

  // 如果只在线下显示且当前在线，不显示组件
  if (showOnlyWhenOffline && isOnline && !showOfflineBanner) {
    return null
  }

  // 在线状态组件
  if (isOnline) {
    return (
      <div className={`flex items-center space-x-2 text-sm ${className}`}>
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span className="text-green-700">
          Online
        </span>
        {showDetailedInfo && lastOnlineTime && (
          <span className="text-xs text-gray-500">
            since {formatTime(lastOnlineTime)}
          </span>
        )}
      </div>
    )
  }

  // 离线状态组件
  return (
    <div className={`bg-yellow-50 border-l-4 border-yellow-400 p-4 ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {isChecking ? (
            <div className="animate-spin">
              <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : (
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            {isChecking ? 'Checking connection...' : 'You are offline'}
          </h3>

          <div className="mt-1 text-sm text-yellow-700">
            <p>
              {isChecking
                ? 'Attempting to restore connection...'
                : 'Changes will be synced when you reconnect.'
              }
            </p>

            {showDetailedInfo && (
              <div className="mt-2 text-xs text-yellow-600 space-y-1">
                {lastOfflineTime && (
                  <p>Offline since: {formatTime(lastOfflineTime)}</p>
                )}
                {reconnectAttempts > 0 && (
                  <p>Reconnect attempts: {reconnectAttempts}</p>
                )}
                {shouldRetryReconnect && (
                  <p>Automatic retry scheduled...</p>
                )}
              </div>
            )}
          </div>

          {/* 重连按钮 */}
          {!isChecking && shouldRetryReconnect && (
            <div className="mt-3">
              <button
                onClick={handleManualReconnect}
                disabled={isRetrying}
                className="inline-flex items-center px-3 py-1.5 border border-yellow-300 text-xs font-medium rounded text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying ? (
                  <>
                    <div className="animate-spin -ml-1 mr-2 h-3 w-3">
                      <svg className="text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a7 7 0 00-7 7h1.5a5.5 5.5 0 015.5-5.5V3z" />
                      </svg>
                    </div>
                    Retrying...
                  </>
                ) : (
                  <>
                    <svg className="-ml-1 mr-2 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Try Again
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 关闭按钮（仅在非自动重试时显示） */}
        {!shouldRetryReconnect && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={() => setShowOfflineBanner(false)}
                className="inline-flex p-1.5 text-yellow-500 hover:text-yellow-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 简化版本，只显示网络状态指示器
export function NetworkStatusIndicator({ className = '' }: { className?: string }) {
  const { isOnline, isChecking } = useNetworkStatus()

  if (isOnline && !isChecking) {
    return (
      <div className={`flex items-center space-x-1 ${className}`}>
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span className="text-xs text-green-600">Online</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${
        isChecking ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
      }`} />
      <span className={`text-xs ${
        isChecking ? 'text-yellow-600' : 'text-red-600'
      }`}>
        {isChecking ? 'Checking...' : 'Offline'}
      </span>
    </div>
  )
}

// 网络状态横幅（用于页面顶部）
export function NetworkStatusBanner({ className = '' }: { className?: string }) {
  const { isOnline, isOffline, isChecking, reconnectAttempts } = useNetworkStatus()

  // 如果在线且没有检查网络，不显示横幅
  if (isOnline && !isChecking) {
    return null
  }

  return (
    <div className={`w-full ${
      isChecking ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'
    } border-b px-4 py-2 text-center text-sm ${className}`}>
      <div className="flex items-center justify-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${
          isChecking ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
        }`} />

        <span>
          {isChecking ? 'Checking network connection...' : 'No network connection'}
        </span>

        {reconnectAttempts > 0 && (
          <span className="text-xs opacity-75">
            (attempt {reconnectAttempts})
          </span>
        )}
      </div>
    </div>
  )
}
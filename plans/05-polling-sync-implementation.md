# 第5阶段：轮询同步功能开发指南

> **目标**：实现增量同步功能，支持多设备实时协作，包含乐观更新和冲突解决
> **预计时间**：2-3天
> **验收标准**：多设备登录同一账号，10秒内数据同步，包含删除操作的传播

## 1. 增量同步架构设计

### 1.1 同步策略概述
- **轮询间隔**：10秒（可配置）
- **增量机制**：基于游标的稳定分页
- **冲突解决**：后写覆盖（MVP）
- **乐观更新**：本地先更新，失败时回滚
- **网络处理**：离线时暂停，恢复时自动续传

### 1.2 游标管理 (utils/sync.ts)
```typescript
import { encodeCursor, decodeCursor } from './cursor'

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
}
```

### 1.3 增量数据合并 (utils/dataMerger.ts)
```typescript
import { Todo } from '@/services/todos'

export interface TodoChange {
  id: string
  title?: string
  done?: boolean
  deleted?: boolean
  updated_at: string
}

export class DataMerger {
  // 合并增量数据到本地列表
  static mergeTodos(localTodos: Todo[], changes: TodoChange[]): Todo[] {
    const todoMap = new Map(localTodos.map(todo => [todo.id, todo]))

    for (const change of changes) {
      if (change.deleted) {
        // 删除操作
        todoMap.delete(change.id)
      } else {
        // 更新或新增操作
        const existing = todoMap.get(change.id)
        if (existing) {
          // 更新现有todo
          if (change.title !== undefined) existing.title = change.title
          if (change.done !== undefined) existing.done = change.done
          existing.updated_at = change.updated_at
        } else {
          // 新增todo（理论上不应该通过增量同步新增）
          console.warn('Received new todo through sync:', change.id)
        }
      }
    }

    return Array.from(todoMap.values())
  }

  // 检测本地更改
  static detectLocalChanges(originalTodos: Todo[], currentTodos: Todo[]): TodoChange[] {
    const originalMap = new Map(originalTodos.map(todo => [todo.id, todo]))
    const currentMap = new Map(currentTodos.map(todo => [todo.id, todo]))

    const changes: TodoChange[] = []

    // 检测删除
    for (const [id, original] of originalMap) {
      if (!currentMap.has(id)) {
        changes.push({
          id,
          deleted: true,
          updated_at: new Date().toISOString(),
        })
      }
    }

    // 检测更新
    for (const [id, current] of currentMap) {
      const original = originalMap.get(id)
      if (original) {
        if (original.title !== current.title || original.done !== current.done) {
          const change: TodoChange = {
            id,
            updated_at: current.updated_at,
          }
          if (original.title !== current.title) {
            change.title = current.title
          }
          if (original.done !== current.done) {
            change.done = current.done
          }
          changes.push(change)
        }
      }
    }

    return changes
  }

  // 应用乐观更新
  static applyOptimisticUpdate(
    todos: Todo[],
    todoId: string,
    update: Partial<Todo>,
    tempId?: string
  ): { todos: Todo[]; undo: () => void } {
    const originalTodos = [...todos]
    let updatedTodos = [...todos]

    if (tempId) {
      // 临时ID（用于创建操作）
      const tempTodo: Todo = {
        id: tempId,
        title: update.title || '',
        done: update.done || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      updatedTodos.push(tempTodo)
    } else {
      // 更新现有todo
      const index = updatedTodos.findIndex(todo => todo.id === todoId)
      if (index !== -1) {
        updatedTodos[index] = { ...updatedTodos[index], ...update }
      }
    }

    const undo = () => {
      return originalTodos
    }

    return { todos: updatedTodos, undo }
  }
}
```

## 2. 同步Hook重构

### 2.1 增强的useTodos Hook (hooks/useTodos.ts)
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosService, Todo, TodoCreate, TodoUpdate } from '@/services/todos'
import { syncStorage } from '@/utils/sync'
import { DataMerger, TodoChange } from '@/utils/dataMerger'
import { useEffect, useRef, useCallback } from 'react'

interface UseTodosOptions {
  cursor?: string
  limit?: number
  enablePolling?: boolean
  pollingInterval?: number
}

export const useTodos = (options: UseTodosOptions = {}) => {
  const {
    cursor: initialCursor,
    limit = 50,
    enablePolling = true,
    pollingInterval = 10000, // 10秒
  } = options

  const queryClient = useQueryClient()
  const userId = useRef<string>()
  const lastSyncRef = useRef<number>()
  const pollingTimeoutRef = useRef<NodeJS.Timeout>()

  // 获取用户ID（从认证状态）
  const getUser = useCallback(() => {
    const authData = queryClient.getQueryData(['auth', 'user']) as any
    return authData?.id
  }, [queryClient])

  // 基础查询
  const todosQuery = useQuery({
    queryKey: ['todos', { cursor: initialCursor, limit }],
    queryFn: async () => {
      const userId = getUser()
      if (!userId) throw new Error('User not authenticated')

      // 获取存储的游标
      const storedCursor = initialCursor || syncStorage.getCursor(userId)

      try {
        const response = await todosService.getTodos(storedCursor, limit)

        // 更新游标
        if (response.next_cursor) {
          syncStorage.setCursor(userId, response.next_cursor)
        }

        // 更新同步时间
        syncStorage.setLastSyncTime(userId, Date.now())
        lastSyncRef.current = Date.now()

        return response
      } catch (error) {
        console.error('Failed to fetch todos:', error)
        throw error
      }
    },
    staleTime: 5 * 1000, // 5秒
    refetchInterval: enablePolling ? pollingInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: !!getUser(),
  })

  // 增量同步查询
  const syncQuery = useQuery({
    queryKey: ['todos', 'sync'],
    queryFn: async () => {
      const userId = getUser()
      if (!userId) return { changes: [] }

      const lastSyncTime = syncStorage.getLastSyncTime(userId)
      const cursor = syncStorage.getCursor(userId)

      if (!cursor && !lastSyncTime) {
        return { changes: [] }
      }

      try {
        const response = await todosService.getTodos(cursor, limit)

        // 解析增量变更
        const currentTodos = queryClient.getQueryData<Todo[]>(['todos']) || []
        const changes: TodoChange[] = []

        // 查找删除的项目
        const deletedIds = new Set(currentTodos.map(t => t.id))
        response.items.forEach(todo => {
          deletedIds.delete(todo.id)
        })

        // 添加删除标记
        deletedIds.forEach(id => {
          changes.push({
            id,
            deleted: true,
            updated_at: new Date().toISOString(),
          })
        })

        // 添加更新项目
        response.items.forEach(todo => {
          const existing = currentTodos.find(t => t.id === todo.id)
          if (existing) {
            changes.push({
              id: todo.id,
              title: todo.title,
              done: todo.done,
              updated_at: todo.updated_at,
            })
          }
        })

        // 更新游标和同步时间
        if (response.next_cursor) {
          syncStorage.setCursor(userId, response.next_cursor)
        }
        syncStorage.setLastSyncTime(userId, Date.now())
        lastSyncRef.current = Date.now()

        return { changes, nextCursor: response.next_cursor }
      } catch (error) {
        console.error('Sync failed:', error)
        throw error
      }
    },
    refetchInterval: enablePolling ? pollingInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: !!getUser() && enablePolling,
  })

  // 应用增量变更
  useEffect(() => {
    if (syncQuery.data?.changes) {
      const currentTodos = queryClient.getQueryData<Todo[]>(['todos']) || []
      const mergedTodos = DataMerger.mergeTodos(currentTodos, syncQuery.data.changes)

      queryClient.setQueryData(['todos'], mergedTodos)
    }
  }, [syncQuery.data, queryClient])

  // 乐观更新的创建操作
  const createTodoMutation = useMutation({
    mutationFn: async (data: TodoCreate) => {
      const response = await todosService.createTodo(data)
      return response
    },
    onMutate: async (newTodo) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      // 获取当前数据
      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 生成临时ID
      const tempId = `temp_${Date.now()}`

      // 应用乐观更新
      const { todos: optimisticTodos } = DataMerger.applyOptimisticUpdate(
        previousTodos,
        tempId,
        {
          id: tempId,
          title: newTodo.title,
          done: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        tempId
      )

      // 更新查询数据
      queryClient.setQueryData(['todos'], optimisticTodos)

      return { previousTodos, tempId }
    },
    onError: (error, variables, context) => {
      // 回滚乐观更新
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }
    },
    onSuccess: (newTodo, variables, context) => {
      // 替换临时ID为真实ID
      if (context?.tempId) {
        queryClient.setQueryData(['todos'], (old: Todo[] | undefined) => {
          if (!old) return old
          return old.map(todo =>
            todo.id === context.tempId ? newTodo : todo
          )
        })
      }
    },
    onSettled: () => {
      // 重新获取数据以确保一致性
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 乐观更新的更新操作
  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TodoUpdate }) => {
      const response = await todosService.updateTodo(id, data)
      return response
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 应用乐观更新
      const { todos: optimisticTodos } = DataMerger.applyOptimisticUpdate(
        previousTodos,
        id,
        {
          ...data,
          updated_at: new Date().toISOString(),
        }
      )

      queryClient.setQueryData(['todos'], optimisticTodos)

      return { previousTodos }
    },
    onError: (error, variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 乐观更新的删除操作
  const deleteTodoMutation = useMutation({
    mutationFn: async (id: string) => {
      await todosService.deleteTodo(id)
      return id
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 应用乐观更新
      const optimisticTodos = previousTodos.filter(todo => todo.id !== id)

      queryClient.setQueryData(['todos'], optimisticTodos)

      return { previousTodos }
    },
    onError: (error, variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 手动同步
  const manualSync = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos', 'sync'] })
  }, [queryClient])

  // 重置同步状态
  const resetSync = useCallback(() => {
    const userId = getUser()
    if (userId) {
      syncStorage.clearCursor(userId)
      syncStorage.setLastSyncTime(userId, Date.now())
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    }
  }, [getUser, queryClient])

  return {
    todos: todosQuery.data?.items || [],
    nextCursor: todosQuery.data?.next_cursor,
    hasMore: todosQuery.data?.has_more || false,
    isLoading: todosQuery.isLoading,
    error: todosQuery.error,
    syncError: syncQuery.error,
    isSyncing: syncQuery.isLoading,
    lastSyncTime: lastSyncRef.current,

    // 操作
    createTodo: createTodoMutation.mutate,
    updateTodo: updateTodoMutation.mutate,
    deleteTodo: deleteTodoMutation.mutate,
    manualSync,
    resetSync,

    // 错误状态
    createError: createTodoMutation.error,
    updateError: updateTodoMutation.error,
    deleteError: deleteTodoMutation.error,
  }
}
```

## 3. 同步状态组件

### 3.1 SyncStatus组件 (components/sync/SyncStatus.tsx)
```typescript
import React from 'react'
import { useTodos } from '@/hooks/useTodos'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

interface SyncStatusProps {
  showManualSync?: boolean
}

export function SyncStatus({ showManualSync = true }: SyncStatusProps) {
  const { isSyncing, lastSyncTime, syncError, manualSync } = useTodos()

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Never'

    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      {/* 同步状态指示器 */}
      <div className="flex items-center space-x-1">
        {isSyncing ? (
          <>
            <LoadingSpinner size="sm" />
            <span className="text-gray-600">Syncing...</span>
          </>
        ) : syncError ? (
          <>
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-red-600">Sync failed</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">
              Last sync: {formatLastSync(lastSyncTime)}
            </span>
          </>
        )}
      </div>

      {/* 手动同步按钮 */}
      {showManualSync && (
        <button
          onClick={manualSync}
          disabled={isSyncing}
          className="text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Manual sync"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}

      {/* 错误重试提示 */}
      {syncError && (
        <button
          onClick={manualSync}
          className="text-red-600 hover:text-red-700 underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}
```

### 3.2 ConflictModal组件 (components/sync/ConflictModal.tsx)
```typescript
import React from 'react'
import { Button } from '@/components/ui/Button'
import { Todo } from '@/services/todos'

interface ConflictModalProps {
  isOpen: boolean
  onClose: () => void
  localTodo: Todo
  remoteTodo: Todo
  onResolve: (useRemote: boolean) => void
}

export function ConflictModal({
  isOpen,
  onClose,
  localTodo,
  remoteTodo,
  onResolve
}: ConflictModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sync Conflict
        </h2>

        <p className="text-sm text-gray-600 mb-4">
          This todo was modified on another device. Which version would you like to keep?
        </p>

        <div className="space-y-3 mb-6">
          {/* 本地版本 */}
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Your changes</h3>
            <p className="text-sm text-gray-600">{localTodo.title}</p>
            <p className="text-xs text-gray-500 mt-1">
              Status: {localTodo.done ? 'Done' : 'Pending'}
            </p>
          </div>

          {/* 远程版本 */}
          <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Device changes</h3>
            <p className="text-sm text-gray-600">{remoteTodo.title}</p>
            <p className="text-xs text-gray-500 mt-1">
              Status: {remoteTodo.done ? 'Done' : 'Pending'}
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => onResolve(false)}
            variant="outline"
          >
            Keep Your Changes
          </Button>
          <Button onClick={() => onResolve(true)}>
            Use Device Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
```

## 4. 网络状态管理

### 4.1 useNetworkStatus Hook (hooks/useNetworkStatus.ts)
```typescript
import { useState, useEffect } from 'react'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline }
}
```

### 4.2 网络状态组件 (components/sync/NetworkStatus.tsx)
```typescript
import React from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

export function NetworkStatus() {
  const { isOnline } = useNetworkStatus()

  if (isOnline) return null

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            You are currently offline. Changes will be synced when you reconnect.
          </p>
        </div>
      </div>
    </div>
  )
}
```

## 5. 更新TodoList页面

### 5.1 集成同步功能 (pages/todos/TodoList.tsx)
```typescript
import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodos } from '@/hooks/useTodos'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { Button } from '@/components/ui/Button'
import { TodoItem } from '@/components/todos/TodoItem'
import { TodoForm } from '@/components/todos/TodoForm'
import { SyncStatus } from '@/components/sync/SyncStatus'
import { NetworkStatus } from '@/components/sync/NetworkStatus'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

export default function TodoList() {
  const { user, logout } = useAuth()
  const { isOnline } = useNetworkStatus()
  const {
    todos,
    isLoading,
    error,
    syncError,
    isSyncing,
    createTodo,
    updateTodo,
    deleteTodo,
    createError,
    updateError,
    deleteError,
    manualSync,
    resetSync
  } = useTodos({ enablePolling: isOnline })

  const [showForm, setShowForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateTodo = async (title: string) => {
    if (!isOnline) {
      alert('Cannot create todos while offline')
      return
    }

    setIsCreating(true)
    try {
      await createTodo({ title })
      setShowForm(false)
    } catch (error) {
      // 错误处理在useTodos中
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleTodo = async (id: string, done: boolean) => {
    if (!isOnline) {
      alert('Cannot update todos while offline')
      return
    }
    try {
      await updateTodo({ id, data: { done } })
    } catch (error) {
      // 错误处理在useTodos中
    }
  }

  const handleDeleteTodo = async (id: string) => {
    if (!isOnline) {
      alert('Cannot delete todos while offline')
      return
    }

    try {
      await deleteTodo(id)
    } catch (error) {
      // 错误处理在useTodos中
    }
  }

  const handleUpdateTitle = async (id: string, title: string) => {
    if (!isOnline) {
      alert('Cannot update todos while offline')
      return
    }

    try {
      await updateTodo({ id, data: { title } })
    } catch (error) {
      // 错误处理在useTodos中
    }
  }

  if (isLoading && todos.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 网络状态提示 */}
      <NetworkStatus />

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 页面头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Todos</h1>
              <p className="mt-1 text-sm text-gray-600">
                Welcome back, {user?.email}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* 同步状态 */}
              <SyncStatus />

              <Button
                onClick={() => setShowForm(!showForm)}
                variant="outline"
                disabled={!isOnline}
              >
                {showForm ? 'Cancel' : 'Add Todo'}
              </Button>
              <Button onClick={logout} variant="outline">
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        {/* 错误显示 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              Failed to load todos. Please try again.
            </p>
            <Button
              onClick={manualSync}
              size="sm"
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        )}

        {syncError && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-sm text-yellow-600">
              Sync failed. Some changes may not be up to date.
            </p>
            <Button
              onClick={manualSync}
              size="sm"
              className="mt-2"
            >
              Retry Sync
            </Button>
          </div>
        )}

        {createError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              Failed to create todo. Please try again.
            </p>
          </div>
        )}

        {/* 创建Todo表单 */}
        {showForm && (
          <div className="mb-6">
            <TodoForm
              onSubmit={handleCreateTodo}
              onCancel={() => setShowForm(false)}
              isLoading={isCreating}
            />
          </div>
        )}

        {/* Todo列表 */}
        <div className="space-y-2">
          {todos.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No todos</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first todo.
              </p>
            </div>
          ) : (
            todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggleTodo}
                onDelete={handleDeleteTodo}
                onUpdateTitle={handleUpdateTitle}
                disabled={!isOnline}
              />
            ))
          )}
        </div>

        {/* 加载指示器 */}
        {isSyncing && todos.length > 0 && (
          <div className="mt-4 flex justify-center">
            <LoadingSpinner size="sm" />
            <span className="ml-2 text-sm text-gray-600">Syncing...</span>
          </div>
        )}

        {/* 离线提示 */}
        {!isOnline && todos.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Offline mode - changes will sync when you reconnect
          </div>
        )}
      </div>
    </div>
  )
}
```

## 6. 开发验证

### 6.1 测试增量同步
```bash
# 启动后端和前端
cd backend && python main.py
cd frontend && npm run dev
```

### 6.2 多设备测试场景
1. **同一账号多设备登录**
   - 浏览器A：正常登录
   - 浏览器B：同一账号登录
   - 在A端创建Todo，10秒内应在B端显示

2. **增量同步测试**
   - 在A端创建多个Todo
   - 在B端修改现有Todo
   - 在A端删除Todo
   - 确认所有变更在10秒内同步

3. **冲突解决测试**
   - 同时在两端修改同一Todo
   - 确认后写覆盖策略生效

4. **离线测试**
   - 断开网络连接
   - 尝试操作Todo（应被阻止）
   - 重新连接，确认同步恢复

### 6.3 性能测试
- 监控轮询请求频率
- 检查数据传输量
- 测试大量数据的处理能力

## 7. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的增量同步机制
- ✅ 乐观更新和错误恢复
- ✅ 多设备实时协作能力
- ✅ 网络状态感知和处理
- ✅ 冲突解决策略

**下一步**：进入第6阶段，Docker容器化部署。

## 8. 关键注意事项

### 8.1 性能优化
- 合理设置轮询间隔
- 避免频繁的全量刷新
- 使用节流/防抖优化频繁操作

### 8.2 错误处理
- 网络错误时的优雅降级
- 同步失败时的重试机制
- 用户友好的错误提示

### 8.3 用户体验
- 清晰的同步状态指示
- 离线模式的明确提示
- 操作反馈的及时性

---

**完成后确认清单**：
- [ ] 增量同步功能正常
- [ ] 多设备数据同步在10秒内完成
- [ ] 乐观更新机制工作正常
- [ ] 网络状态处理正确
- [ ] 冲突解决策略生效
- [ ] 用户界面同步状态清晰
- [ ] 离线模式处理正确
- [ ] 性能表现良好
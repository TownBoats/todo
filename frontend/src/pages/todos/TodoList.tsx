import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodos } from '@/hooks/useTodos'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { Button } from '@/components/ui/Button'
import TodoItem from '@/components/todos/TodoItem'
import TodoForm from '@/components/todos/TodoForm'
import { SyncStatus } from '@/components/sync/SyncStatus'
import { NetworkStatus } from '@/components/sync/NetworkStatus'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { APIError } from '@/services/api'

export default function TodoList() {
  const { user, logout } = useAuth()
  const { isOnline, canSync } = useNetworkStatus()
  const {
    todos,
    isLoading,
    error,
    syncError,
    isSyncing,
    createTodo,
    updateTodo,
    deleteTodo,
    manualSync,
    createError,
    updateError,
    deleteError,
    isCreating: isCreatingTodo,
    isUpdating,
    isDeleting,
    isMutating,
    lastSyncTime
  } = useTodos({ enablePolling: canSync })

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
      {/* 网络状态横幅 */}
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
              <SyncStatus showDetailedStatus={false} />

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

        {/* 网络状态提示 */}
        {!isOnline && (
          <div className="mb-6">
            <NetworkStatus showOnlyWhenOffline={false} showDetailedInfo={true} />
          </div>
        )}

        {/* 错误显示 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              {error instanceof APIError ? error.message : 'Failed to load todos'}
            </p>
            <Button
              onClick={manualSync}
              size="sm"
              className="mt-2"
              disabled={!canSync}
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
              disabled={!canSync}
            >
              Retry Sync
            </Button>
          </div>
        )}

        {createError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              {createError instanceof APIError ? createError.message : 'Failed to create todo'}
            </p>
          </div>
        )}

        {updateError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              {updateError instanceof APIError ? updateError.message : 'Failed to update todo'}
            </p>
          </div>
        )}

        {deleteError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              {deleteError instanceof APIError ? deleteError.message : 'Failed to delete todo'}
            </p>
          </div>
        )}

        {/* 创建Todo表单 */}
        {showForm && (
          <div className="mb-6">
            <TodoForm
              onSubmit={handleCreateTodo}
              onCancel={() => setShowForm(false)}
              isLoading={isCreating || isCreatingTodo}
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
                disabled={!isOnline || isUpdating || isDeleting}
              />
            ))
          )}
        </div>

        {/* 同步状态指示器 */}
        {(isSyncing || isMutating) && todos.length > 0 && (
          <div className="mt-6 flex flex-col items-center space-y-2">
            <div className="flex items-center space-x-2">
              <LoadingSpinner size="sm" />
              <span className="text-sm text-gray-600">
                {isSyncing ? 'Syncing...' :
                 isCreatingTodo ? 'Creating...' :
                 isUpdating ? 'Updating...' :
                 isDeleting ? 'Deleting...' : 'Processing...'}
              </span>
            </div>
          </div>
        )}

        {/* 离线提示 */}
        {!isOnline && todos.length > 0 && (
          <div className="mt-6 text-center">
            <div className="inline-flex items-center px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="w-4 h-4 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-yellow-700">
                Offline mode - changes will sync when you reconnect
              </span>
            </div>
          </div>
        )}

        {/* 底部同步信息 */}
        {isOnline && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <SyncStatus showManualSync={true} showDetailedStatus={true} />

              <div className="flex items-center space-x-4">
                <span>
                  {todos.length} {todos.length === 1 ? 'todo' : 'todos'}
                </span>
                {lastSyncTime && (
                  <span>
                    Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
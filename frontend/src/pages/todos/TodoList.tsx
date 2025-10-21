import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodos } from '@/hooks/useTodos'
import { Button } from '@/components/ui'
import TodoItem from '@/components/todos/TodoItem'
import TodoForm from '@/components/todos/TodoForm'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { APIError } from '@/services/api'

export default function TodoList() {
  const { user, logout } = useAuth()
  const {
    todos,
    isLoading,
    error,
    createTodo,
    updateTodo,
    deleteTodo,
    createError,
    updateError,
    deleteError
  } = useTodos()

  const [showForm, setShowForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateTodo = async (title: string) => {
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
    try {
      await updateTodo({ id, data: { done } })
    } catch (error) {
      // 错误处理在useTodos中
    }
  }

  const handleDeleteTodo = async (id: string) => {
    try {
      await deleteTodo(id)
    } catch (error) {
      // 错误处理在useTodos中
    }
  }

  const handleUpdateTitle = async (id: string, title: string) => {
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
              <Button
                onClick={() => setShowForm(!showForm)}
                variant="outline"
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
              {error instanceof APIError ? error.message : 'Failed to load todos'}
            </p>
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
              />
            ))
          )}
        </div>

        {/* 加载指示器 */}
        {isLoading && todos.length > 0 && (
          <div className="mt-4 flex justify-center">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}
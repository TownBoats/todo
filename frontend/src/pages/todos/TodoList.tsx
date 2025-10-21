import React, { useState } from 'react'
import { useTodos } from '@/hooks/useTodos'
import { Button, Input } from '@/components/ui'
import { LoadingSpinner } from '@/components/layout'
import { PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline'

const TodoList: React.FC = () => {
  const { todos, isLoading, createTodo, updateTodo, deleteTodo, createError } = useTodos()
  const [newTodoTitle, setNewTodoTitle] = useState('')

  const handleCreateTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (newTodoTitle.trim()) {
      createTodo({ title: newTodoTitle.trim() })
      setNewTodoTitle('')
    }
  }

  const handleToggleTodo = (id: string, done: boolean) => {
    updateTodo({ id, data: { done: !done } })
  }

  const handleDeleteTodo = (id: string) => {
    deleteTodo(id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">My Todos</h1>
        </div>

        <div className="p-6">
          {/* 添加新Todo */}
          <form onSubmit={handleCreateTodo} className="mb-6">
            <div className="flex space-x-3">
              <Input
                type="text"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="flex-1"
              />
              <Button type="submit" disabled={!newTodoTitle.trim()}>
                <PlusIcon className="h-5 w-5" />
              </Button>
            </div>
            {createError && (
              <div className="mt-2 text-sm text-red-600">
                {createError.message}
              </div>
            )}
          </form>

          {/* Todo列表 */}
          <div className="space-y-2">
            {todos.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No todos yet</p>
                <p className="text-sm mt-2">Create your first todo to get started!</p>
              </div>
            ) : (
              todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleTodo(todo.id, todo.done)}
                    className={`flex-shrink-0 ${todo.done ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    <CheckIcon className="h-5 w-5" />
                  </Button>

                  <span
                    className={`flex-1 text-gray-900 ${
                      todo.done ? 'line-through text-gray-500' : ''
                    }`}
                  >
                    {todo.title}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="flex-shrink-0 text-red-500 hover:text-red-700"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { TodoList }
import React, { useState } from 'react'
import type { Todo } from '@/types'
import { Button, Input } from '@/components/ui'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string) => void
  onUpdateTitle: (id: string, title: string) => void
  disabled?: boolean
}

function TodoItem({ todo, onToggle, onDelete, onUpdateTitle, disabled = false }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(todo.title)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggle = () => {
    onToggle(todo.id, !todo.done)
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditTitle(todo.title)
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return

    setIsUpdating(true)
    try {
      await onUpdateTitle(todo.id, editTitle.trim())
      setIsEditing(false)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditTitle(todo.title)
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this todo?')) {
      setIsDeleting(true)
      try {
        await onDelete(todo.id)
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center space-x-3">
        {/* 复选框 */}
        <button
          onClick={handleToggle}
          className="flex-shrink-0 h-5 w-5 rounded border-2 border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          disabled={disabled || isUpdating || isDeleting}
        >
          {todo.done && (
            <svg className="h-5 w-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* 标题区域 */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') handleCancel()
                }}
                className="flex-1"
                disabled={disabled || isUpdating}
              />
              <Button
                onClick={handleSave}
                disabled={disabled || isUpdating || !editTitle.trim()}
                size="sm"
              >
                Save
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm" disabled={disabled}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-medium ${todo.done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                {todo.title}
              </h3>
              <div className="flex items-center space-x-2 opacity-0 hover:opacity-100 transition-opacity">
                <Button onClick={handleEdit} variant="ghost" size="sm" disabled={disabled}>
                  Edit
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="ghost"
                  size="sm"
                  disabled={disabled || isDeleting}
                  className="text-red-600 hover:text-red-700"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          )}

          {/* 元数据 */}
          {!isEditing && (
            <div className="mt-1 text-sm text-gray-500">
              Created {formatDate(todo.created_at)}
              {todo.updated_at !== todo.created_at && (
                <span> • Updated {formatDate(todo.updated_at)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TodoItem
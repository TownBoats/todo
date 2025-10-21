import React, { useState } from 'react'
import { Button, Input } from '@/components/ui'

interface TodoFormProps {
  onSubmit: (title: string) => void
  onCancel: () => void
  isLoading: boolean
}

function TodoForm({ onSubmit, onCancel, isLoading }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (title.trim().length > 200) {
      setError('Title must be less than 200 characters')
      return
    }

    onSubmit(title.trim())
    setTitle('')
    setError('')
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error) setError('')
            }}
            placeholder="What needs to be done?"
            disabled={isLoading}
            className={error ? 'border-red-500' : ''}
          />
          {error && (
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={onCancel}
            variant="outline"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !title.trim()}
          >
            {isLoading ? 'Adding...' : 'Add Todo'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default TodoForm
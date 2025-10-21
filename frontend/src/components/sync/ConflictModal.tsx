import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Todo {
  id: string
  title: string
  done: boolean
  created_at: string
  updated_at: string
}

interface ConflictModalProps {
  isOpen: boolean
  onClose: () => void
  localTodo: Todo
  remoteTodo: Todo
  onResolve: (useRemote: boolean) => void
  isLoading?: boolean
}

export function ConflictModal({
  isOpen,
  onClose,
  localTodo,
  remoteTodo,
  onResolve,
  isLoading = false
}: ConflictModalProps) {
  if (!isOpen) return null

  const handleUseLocal = () => {
    onResolve(false)
  }

  const handleUseRemote = () => {
    onResolve(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getConflictType = () => {
    const conflicts = []

    if (localTodo.title !== remoteTodo.title) {
      conflicts.push('Title')
    }

    if (localTodo.done !== remoteTodo.done) {
      conflicts.push('Status')
    }

    return conflicts.length > 0 ? conflicts.join(', ') : 'Unknown'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Sync Conflict Detected
            </h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              This todo was modified on multiple devices. Please choose which version you'd like to keep.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Conflict type: {getConflictType()}
            </p>
          </div>

          {/* 对比视图 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* 本地版本 */}
            <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Your Changes</h3>
                <span className="text-xs text-gray-500">
                  {formatDate(localTodo.updated_at)}
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Title:</p>
                  <p className="text-sm font-medium text-gray-900 break-words">
                    {localTodo.title}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1">Status:</p>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      localTodo.done
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {localTodo.done ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 远程版本 */}
            <div className="border border-gray-200 rounded-lg p-4 bg-green-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Device Changes</h3>
                <span className="text-xs text-gray-500">
                  {formatDate(remoteTodo.updated_at)}
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Title:</p>
                  <p className="text-sm font-medium text-gray-900 break-words">
                    {remoteTodo.title}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1">Status:</p>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      remoteTodo.done
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {remoteTodo.done ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 变更高亮 */}
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>Differences detected:</strong>
            </p>
            <ul className="text-xs text-yellow-700 mt-1 space-y-1">
              {localTodo.title !== remoteTodo.title && (
                <li>• Title differs between versions</li>
              )}
              {localTodo.done !== remoteTodo.done && (
                <li>• Completion status differs</li>
              )}
            </ul>
          </div>

          {/* 帮助文本 */}
          <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Tip:</strong> The most recently updated version is highlighted in green.
              Choose "Keep Your Changes" to preserve your modifications, or "Use Device Changes"
              to accept the version from another device.
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="flex justify-end space-x-3">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={isLoading}
            >
              Cancel
            </Button>

            <Button
              onClick={handleUseLocal}
              variant="outline"
              disabled={isLoading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Keep Your Changes
            </Button>

            <Button
              onClick={handleUseRemote}
              disabled={isLoading}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              Use Device Changes
            </Button>
          </div>

          {isLoading && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">Resolving conflict...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 批量冲突解决模态框
export interface ConflictData {
  id: string
  localTodo: Todo
  remoteTodo: Todo
}

interface BatchConflictModalProps {
  isOpen: boolean
  onClose: () => void
  conflicts: ConflictData[]
  onResolveAll: (resolutions: { id: string; useRemote: boolean }[]) => void
  isLoading?: boolean
}

export function BatchConflictModal({
  isOpen,
  onClose,
  conflicts,
  onResolveAll,
  isLoading = false
}: BatchConflictModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, boolean>>({})

  if (!isOpen) return null

  const handleResolutionChange = (id: string, useRemote: boolean) => {
    setResolutions(prev => ({
      ...prev,
      [id]: useRemote
    }))
  }

  const handleResolveAll = () => {
    const resolutionList = conflicts.map(conflict => ({
      id: conflict.id,
      useRemote: resolutions[conflict.id] ?? false // 默认使用本地版本
    }))
    onResolveAll(resolutionList)
  }

  const handleUseAllLocal = () => {
    const allLocal = conflicts.reduce((acc, conflict) => {
      acc[conflict.id] = false
      return acc
    }, {} as Record<string, boolean>)
    setResolutions(allLocal)
  }

  const handleUseAllRemote = () => {
    const allRemote = conflicts.reduce((acc, conflict) => {
      acc[conflict.id] = true
      return acc
    }, {} as Record<string, boolean>)
    setResolutions(allRemote)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Multiple Sync Conflicts
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {conflicts.length} todos have conflicts. Please choose how to resolve them.
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 快速操作按钮 */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              <Button
                onClick={handleUseAllLocal}
                variant="outline"
                size="sm"
                disabled={isLoading}
              >
                Use All Local
              </Button>
              <Button
                onClick={handleUseAllRemote}
                variant="outline"
                size="sm"
                disabled={isLoading}
              >
                Use All Remote
              </Button>
            </div>
            <span className="text-xs text-gray-500">
              {Object.keys(resolutions).length} of {conflicts.length} resolved
            </span>
          </div>
        </div>

        {/* 冲突列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {conflicts.map((conflict, index) => (
              <div key={conflict.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900">
                    Conflict {index + 1}
                  </h4>
                  <div className="flex items-center space-x-2">
                    <label className="text-xs text-gray-600">Keep:</label>
                    <select
                      value={resolutions[conflict.id] === undefined ? 'local' : resolutions[conflict.id] ? 'remote' : 'local'}
                      onChange={(e) => handleResolutionChange(conflict.id, e.target.value === 'remote')}
                      disabled={isLoading}
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="local">Your Changes</option>
                      <option value="remote">Device Changes</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className={`p-2 rounded border ${
                    resolutions[conflict.id] === false ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className="font-medium mb-1">Your version:</p>
                    <p className="text-gray-700 truncate">{conflict.localTodo.title}</p>
                    <p className="text-gray-500 mt-1">
                      Status: {conflict.localTodo.done ? 'Done' : 'Pending'}
                    </p>
                  </div>
                  <div className={`p-2 rounded border ${
                    resolutions[conflict.id] === true ? 'bg-green-100 border-green-300' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <p className="font-medium mb-1">Device version:</p>
                    <p className="text-gray-700 truncate">{conflict.remoteTodo.title}</p>
                    <p className="text-gray-500 mt-1">
                      Status: {conflict.remoteTodo.done ? 'Done' : 'Pending'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveAll}
              disabled={isLoading || Object.keys(resolutions).length === 0}
            >
              Resolve All Conflicts
            </Button>
          </div>

          {isLoading && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">Resolving conflicts...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
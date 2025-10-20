# 第4阶段：前后端集成开发指南

> **目标**：实现完整的用户认证和Todo管理界面，包含乐观更新和错误处理
> **预计时间**：2-3天
> **验收标准**：用户可完成注册/登录流程，Todo的增删改查功能正常，用户体验流畅

## 1. 认证页面开发

### 1.1 登录页面 (pages/auth/Login.tsx)
```typescript
import React, { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { APIError } from '@/services/api'

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { login, isAuthenticated, loginError, isLoading } = useAuth()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/todos'

  // 如果已登录，重定向到目标页面
  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // 清除该字段的错误
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // 基础验证
    const newErrors: Record<string, string> = {}
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }
    if (!formData.password) {
      newErrors.password = 'Password is required'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // 调用登录API
    login(formData)
  }

  // 处理API错误
  React.useEffect(() => {
    if (loginError instanceof APIError) {
      const newErrors: Record<string, string> = {}

      if (loginError.code === 'INVALID_CREDENTIALS') {
        newErrors.form = loginError.message
      } else if (loginError.details?.field) {
        newErrors[loginError.details.field] = loginError.message
      } else {
        newErrors.form = 'Login failed. Please try again.'
      }

      setErrors(newErrors)
    }
  }, [loginError])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link
              to="/register"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              create a new account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {errors.form && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-600">{errors.form}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`mt-1 ${errors.email ? 'border-red-500' : ''}`}
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleInputChange}
                className={`mt-1 ${errors.password ? 'border-red-500' : ''}`}
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

### 1.2 注册页面 (pages/auth/Register.tsx)
```typescript
import React, { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { APIError } from '@/services/api'

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSuccess, setIsSuccess] = useState(false)

  const { register, registerError, isLoading } = useAuth()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // 验证
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
      })
      setIsSuccess(true)
    } catch (error) {
      // 错误处理在useEffect中
    }
  }

  React.useEffect(() => {
    if (registerError instanceof APIError) {
      const newErrors: Record<string, string> = {}

      if (registerError.code === 'EMAIL_EXISTS') {
        newErrors.email = registerError.message
      } else if (registerError.details?.field) {
        newErrors[registerError.details.field] = registerError.message
      } else {
        newErrors.form = 'Registration failed. Please try again.'
      }

      setErrors(newErrors)
    }
  }, [registerError])

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Registration successful!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your account has been created. You can now{' '}
              <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
                sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link
              to="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              sign in to your existing account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {errors.form && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-600">{errors.form}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`mt-1 ${errors.email ? 'border-red-500' : ''}`}
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={handleInputChange}
                className={`mt-1 ${errors.password ? 'border-red-500' : ''}`}
                placeholder="Create a password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className={`mt-1 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="Confirm your password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

## 2. 受保护路由组件

### 2.1 ProtectedRoute组件 (components/common/ProtectedRoute.tsx)
```typescript
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

## 3. Todo管理页面

### 3.1 TodoList页面 (pages/todos/TodoList.tsx)
```typescript
import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodos } from '@/hooks/useTodos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TodoItem } from '@/components/todos/TodoItem'
import { TodoForm } from '@/components/todos/TodoForm'
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
```

### 3.2 TodoItem组件 (components/todos/TodoItem.tsx)
```typescript
import React, { useState } from 'react'
import { Todo } from '@/services/todos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string) => void
  onUpdateTitle: (id: string, title: string) => void
}

export function TodoItem({ todo, onToggle, onDelete, onUpdateTitle }: TodoItemProps) {
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
          className="flex-shrink-0 h-5 w-5 rounded border-2 border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          disabled={isUpdating || isDeleting}
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
                disabled={isUpdating}
              />
              <Button
                onClick={handleSave}
                disabled={isUpdating || !editTitle.trim()}
                size="sm"
              >
                Save
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm">
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-medium ${todo.done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                {todo.title}
              </h3>
              <div className="flex items-center space-x-2 opacity-0 hover:opacity-100 transition-opacity">
                <Button onClick={handleEdit} variant="ghost" size="sm">
                  Edit
                </Button>
                <Button
                  onClick={handleDelete}
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
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
```

### 3.3 TodoForm组件 (components/todos/TodoForm.tsx)
```typescript
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface TodoFormProps {
  onSubmit: (title: string) => void
  onCancel: () => void
  isLoading: boolean
}

export function TodoForm({ onSubmit, onCancel, isLoading }: TodoFormProps) {
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
```

## 4. 布局组件

### 4.1 Layout组件 (components/layout/Layout.tsx)
```typescript
import React, { ReactNode } from 'react'
import { Header } from './Header'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main>{children}</main>
    </div>
  )
}
```

### 4.2 Header组件 (components/layout/Header.tsx)
```typescript
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export function Header() {
  const { user, logout, isAuthenticated } = useAuth()
  const location = useLocation()

  // 在认证页面不显示header
  if (['/login', '/register'].includes(location.pathname)) {
    return null
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/todos" className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Todo App</h1>
          </Link>

          {isAuthenticated && user && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user.email}</span>
              <Button onClick={logout} variant="outline" size="sm">
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
```

### 4.3 LoadingSpinner组件 (components/layout/LoadingSpinner.tsx)
```typescript
import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600 ${sizeClasses[size]} ${className}`}>
    </div>
  )
}
```

## 5. 错误边界组件

### 5.1 ErrorBoundary (components/common/ErrorBoundary.tsx)
```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              We're sorry, but something unexpected happened.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
            >
              Reload page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500">
                  Error details
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
```

## 6. NotFound页面

### 6.1 NotFound页面 (pages/NotFound.tsx)
```typescript
import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-lg text-gray-600 mb-6">Page not found</p>
        <Link
          to="/todos"
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          Go to todos
        </Link>
      </div>
    </div>
  )
}
```

## 7. 开发验证

### 7.1 启动前后端服务
```bash
# 后端
cd backend
source venv/bin/activate
python main.py

# 前端（新终端）
cd frontend
npm run dev
```

### 7.2 测试完整流程
1. **注册新用户**
   - 访问 http://localhost:5173/register
   - 填写邮箱和密码
   - 确认注册成功

2. **登录测试**
   - 访问 http://localhost:5173/login
   - 使用注册的账号登录
   - 确认跳转到Todo页面

3. **Todo CRUD测试**
   - 创建新Todo
   - 编辑Todo标题
   - 切换Todo完成状态
   - 删除Todo

4. **错误处理测试**
   - 测试无效的登录凭据
   - 测试网络错误
   - 测试表单验证

### 7.3 浏览器开发者工具检查
- 网络请求是否正常
- JWT token是否正确存储和使用
- 错误处理是否正常工作
- 页面响应是否流畅

## 8. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的用户认证流程
- ✅ Todo的增删改查功能
- ✅ 良好的用户体验和错误处理
- ✅ 响应式设计和交互反馈
- ✅ 基础的乐观更新机制

**下一步**：进入第5阶段，实现增量同步和轮询功能。

## 9. 关键注意事项

### 9.1 用户体验
- 提供清晰的加载和错误状态
- 表单验证要即时反馈
- 操作确认要谨慎（如删除）

### 9.2 错误处理
- 区分不同类型的错误
- 提供用户友好的错误信息
- 记录错误信息用于调试

### 9.3 性能优化
- 避免不必要的重渲染
- 合理使用React.memo
- 优化列表渲染性能

---

**完成后确认清单**：
- [ ] 用户注册功能完整
- [ ] 用户登录功能完整
- [ ] Todo CRUD操作正常
- [ ] 表单验证和错误处理完善
- [ ] 页面交互流畅
- [ ] 响应式设计良好
- [ ] JWT认证机制正常工作
- [ ] 错误边界和错误处理完善
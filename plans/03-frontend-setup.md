# 第3阶段：前端骨架搭建指南

> **目标**：搭建 React + Vite + TanStack Query + 路由的前端基础架构
> **预计时间**：1-2天
> **验收标准**：前端项目可正常启动，路由工作正常，可连接后端API

## 1. 项目初始化

### 1.1 创建Vite React项目
```bash
# 在项目根目录下
npm create vite@latest frontend -- --template react-ts
cd frontend

# 安装依赖
npm install
```

### 1.2 安装额外依赖
```bash
# 状态管理和API调用
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install axios

# 路由
npm install react-router-dom

# UI和样式（可选）
npm install tailwindcss postcss autoprefixer
npm install @headlessui/react @heroicons/react

# 类型定义
npm install -D @types/react @types/react-dom

# 开发工具
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

### 1.3 配置Tailwind CSS（可选）
```bash
# 初始化Tailwind
npx tailwindcss init -p

# 配置tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 1.4 更新CSS文件
```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
```

## 2. 项目结构设计

### 2.1 目录结构
```
frontend/
├── public/
├── src/
│   ├── components/          # 可复用组件
│   │   ├── ui/             # 基础UI组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── index.ts
│   │   ├── layout/         # 布局组件
│   │   │   ├── Header.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   └── common/         # 通用组件
│   │       ├── ErrorBoundary.tsx
│   │       └── ProtectedRoute.tsx
│   ├── pages/              # 页面组件
│   │   ├── auth/
│   │   │   ├── Login.tsx
│   │   │   └── Register.tsx
│   │   ├── todos/
│   │   │   └── TodoList.tsx
│   │   └── NotFound.tsx
│   ├── hooks/              # 自定义Hooks
│   │   ├── useAuth.ts
│   │   ├── useTodos.ts
│   │   └── useLocalStorage.ts
│   ├── services/           # API服务
│   │   ├── api.ts          # Axios配置
│   │   ├── auth.ts         # 认证API
│   │   └── todos.ts        # Todo API
│   ├── stores/             # 状态管理
│   │   ├── authStore.ts
│   │   └── queryClient.ts
│   ├── types/              # TypeScript类型定义
│   │   ├── auth.ts
│   │   ├── todo.ts
│   │   └── api.ts
│   ├── utils/              # 工具函数
│   │   ├── constants.ts
│   │   ├── helpers.ts
│   │   └── validation.ts
│   ├── styles/             # 样式文件
│   │   └── globals.css
│   ├── App.tsx             # 根组件
│   ├── main.tsx            # 应用入口
│   └── vite-env.d.ts       # Vite类型声明
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 3. 基础配置

### 3.1 Vite配置 (vite.config.ts)
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
```

### 3.2 TypeScript配置 (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## 4. API服务层

### 4.1 Axios配置 (services/api.ts)
```typescript
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// 创建axios实例
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加认证token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：处理token刷新
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          })

          const { access_token, refresh_token: newRefreshToken } = response.data
          localStorage.setItem('access_token', access_token)
          localStorage.setItem('refresh_token', newRefreshToken)

          // 重试原始请求
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        // 刷新失败，清除tokens并重定向到登录页
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// API错误处理
export class APIError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'APIError'
  }
}

// 处理API响应错误
export const handleAPIError = (error: AxiosError): APIError => {
  if (error.response) {
    const { status, data } = error.response
    const errorData = data as any

    if (errorData?.error) {
      return new APIError(
        status,
        errorData.error.code,
        errorData.error.message,
        errorData.error.details
      )
    }

    return new APIError(status, 'UNKNOWN_ERROR', 'An unknown error occurred')
  } else if (error.request) {
    return new APIError(0, 'NETWORK_ERROR', 'Network error occurred')
  } else {
    return new APIError(0, 'REQUEST_ERROR', error.message || 'Request failed')
  }
}
```

### 4.2 认证服务 (services/auth.ts)
```typescript
import { apiClient, handleAPIError } from './api'

export interface User {
  id: string
  email: string
  created_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/api/v1/auth/login', credentials)

      // 存储tokens
      localStorage.setItem('access_token', response.data.access_token)
      localStorage.setItem('refresh_token', response.data.refresh_token)

      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  async register(data: RegisterData): Promise<User> {
    try {
      const response = await apiClient.post<User>('/api/v1/auth/signup', data)
      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  async getCurrentUser(): Promise<User> {
    try {
      const response = await apiClient.get<User>('/api/v1/auth/me')
      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  logout(): void {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  },

  getStoredToken(): string | null {
    return localStorage.getItem('access_token')
  },

  isAuthenticated(): boolean {
    return !!this.getStoredToken()
  },
}
```

### 4.3 Todo服务 (services/todos.ts)
```typescript
import { apiClient, handleAPIError } from './api'

export interface Todo {
  id: string
  title: string
  done: boolean
  created_at: string
  updated_at: string
}

export interface TodoCreate {
  title: string
}

export interface TodoUpdate {
  title?: string
  done?: boolean
}

export interface TodosResponse {
  items: Todo[]
  next_cursor?: string
  has_more: boolean
}

export const todosService = {
  async getTodos(cursor?: string, limit: number = 50): Promise<TodosResponse> {
    try {
      const params = new URLSearchParams()
      if (cursor) params.append('cursor', cursor)
      params.append('limit', limit.toString())

      const response = await apiClient.get<TodosResponse>(`/api/v1/todos/?${params}`)
      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  async createTodo(data: TodoCreate): Promise<Todo> {
    try {
      const response = await apiClient.post<Todo>('/api/v1/todos/', data)
      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  async updateTodo(id: string, data: TodoUpdate): Promise<Todo> {
    try {
      const response = await apiClient.patch<Todo>(`/api/v1/todos/${id}`, data)
      return response.data
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },

  async deleteTodo(id: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/todos/${id}`)
    } catch (error) {
      throw handleAPIError(error as any)
    }
  },
}
```

## 5. 状态管理

### 5.1 QueryClient配置 (stores/queryClient.ts)
```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 1000, // 5秒
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
})
```

### 5.2 认证状态管理 (stores/authStore.ts)
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types/auth'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)
```

## 6. 自定义Hooks

### 6.1 认证Hook (hooks/useAuth.ts)
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'
import { LoginCredentials, RegisterData } from '@/services/auth'

export const useAuth = () => {
  const queryClient = useQueryClient()
  const { setUser, logout: storeLogout } = useAuthStore()

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      setUser(data.user)
      queryClient.invalidateQueries({ queryKey: ['auth'] })
    },
  })

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
  })

  const logoutMutation = useMutation({
    mutationFn: () => Promise.resolve(),
    onSuccess: () => {
      authService.logout()
      storeLogout()
      queryClient.clear()
    },
  })

  const currentUserQuery = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => authService.getCurrentUser(),
    enabled: authService.isAuthenticated(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5分钟
  })

  const logout = () => {
    logoutMutation.mutate()
  }

  return {
    user: currentUserQuery.data,
    isLoading: currentUserQuery.isLoading,
    isAuthenticated: authService.isAuthenticated(),
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  }
}
```

### 6.2 Todos Hook (hooks/useTodos.ts)
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosService, Todo, TodoCreate, TodoUpdate } from '@/services/todos'

export const useTodos = (cursor?: string, limit: number = 50) => {
  const queryClient = useQueryClient()

  const todosQuery = useQuery({
    queryKey: ['todos', { cursor, limit }],
    queryFn: () => todosService.getTodos(cursor, limit),
    staleTime: 5 * 1000, // 5秒
    refetchInterval: 10 * 1000, // 10秒轮询
  })

  const createTodoMutation = useMutation({
    mutationFn: (data: TodoCreate) => todosService.createTodo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TodoUpdate }) =>
      todosService.updateTodo(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const deleteTodoMutation = useMutation({
    mutationFn: (id: string) => todosService.deleteTodo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return {
    todos: todosQuery.data?.items || [],
    nextCursor: todosQuery.data?.next_cursor,
    hasMore: todosQuery.data?.has_more || false,
    isLoading: todosQuery.isLoading,
    error: todosQuery.error,
    createTodo: createTodoMutation.mutate,
    updateTodo: updateTodoMutation.mutate,
    deleteTodo: deleteTodoMutation.mutate,
    createError: createTodoMutation.error,
    updateError: updateTodoMutation.error,
    deleteError: deleteTodoMutation.error,
  }
}
```

## 7. 基础组件

### 7.1 UI组件 (components/ui/Button.tsx)
```typescript
import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-3 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

### 7.2 Input组件 (components/ui/Input.tsx)
```typescript
import React from 'react'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
```

## 8. 路由配置

### 8.1 应用路由 (App.tsx)
```typescript
import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/stores/queryClient'

// 页面组件
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import TodoList from '@/pages/todos/TodoList'
import NotFound from '@/pages/NotFound'

// 布局组件
import Layout from '@/components/layout/Layout'
import ProtectedRoute from '@/components/common/ProtectedRoute'

// 错误边界
import ErrorBoundary from '@/components/common/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 受保护的路由 */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/todos" replace />} />
                      <Route path="/todos" element={<TodoList />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
```

## 9. 应用入口

### 9.1 Main入口 (main.tsx)
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

## 10. 开发验证

### 10.1 启动开发服务器
```bash
cd frontend
npm run dev
```

### 10.2 验证步骤
1. 访问 http://localhost:5173
2. 确认路由导航正常
3. 确认页面可正常加载
4. 测试API连接（确保后端已启动）

### 10.3 环境变量配置 (.env)
```env
VITE_API_URL=http://localhost:8000
```

## 11. 开发工具配置

### 11.1 ESLint配置 (.eslintrc.cjs)
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
```

## 12. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的React项目结构
- ✅ 配置好的开发环境和构建工具
- ✅ API服务层和错误处理
- ✅ 基础的状态管理和自定义Hooks
- ✅ 路由配置和导航
- ✅ 可复用的UI组件库

**下一步**：进入第4阶段，实现具体的页面组件和前后端集成。

## 13. 常见问题解决

### 13.1 路由问题
- 确保使用了BrowserRouter而不是HashRouter
- 检查路由路径是否正确配置

### 13.2 API代理问题
- 确认vite.config.ts中的代理配置正确
- 检查后端服务是否在8000端口运行

### 13.3 TypeScript类型问题
- 确保所有API接口都有正确的类型定义
- 检查导入路径是否正确

---

**完成后确认清单**：
- [ ] 前端项目可正常启动
- [ ] 路由导航工作正常
- [ ] API服务层配置完成
- [ ] 基础组件可正常使用
- [ ] 开发工具配置正确
- [ ] TypeScript类型检查通过
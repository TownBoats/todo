// 统一类型定义文件

// 认证相关类型
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

// Todo相关类型
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

// API错误类型
export interface APIError {
  status: number
  code: string
  message: string
  details?: any
}
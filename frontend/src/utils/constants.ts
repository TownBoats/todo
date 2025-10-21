export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/signup',
    REFRESH: '/api/v1/auth/refresh',
    ME: '/api/v1/auth/me',
  },
  TODOS: '/api/v1/todos/',
} as const

export const QUERY_KEYS = {
  AUTH: 'auth',
  TODOS: 'todos',
} as const

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  TODOS: '/todos',
} as const
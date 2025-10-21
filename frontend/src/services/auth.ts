import { apiClient, handleAPIError } from './api'

// 本地类型定义 - 避免导入问题
interface User {
  id: string
  email: string
  created_at: string
}

interface LoginCredentials {
  email: string
  password: string
}

interface RegisterData {
  email: string
  password: string
}

interface AuthResponse {
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
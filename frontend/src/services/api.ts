import axios from 'axios'
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// API错误类型定义
export interface APIError {
  status: number
  code: string
  message: string
  details?: any
}

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
export class APIErrorImpl extends Error {
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
      return new APIErrorImpl(
        status,
        errorData.error.code,
        errorData.error.message,
        errorData.error.details
      )
    }

    return new APIErrorImpl(status, 'UNKNOWN_ERROR', 'An unknown error occurred')
  } else if (error.request) {
    return new APIErrorImpl(0, 'NETWORK_ERROR', 'Network error occurred')
  } else {
    return new APIErrorImpl(0, 'REQUEST_ERROR', error.message || 'Request failed')
  }
}
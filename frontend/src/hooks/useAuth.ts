import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'

// 本地类型定义 - 避免导入问题
interface LoginCredentials {
  email: string
  password: string
}

interface RegisterData {
  email: string
  password: string
}

export const useAuth = () => {
  const queryClient = useQueryClient()
  const { setUser, logout: storeLogout } = useAuthStore()

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data, variables, context) => {
      setUser(data.user)
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      // 如果有自定义的onSuccess回调，则执行它
      if (context?.onSuccess) {
        context.onSuccess()
      }
    },
  })

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onSuccess: (data, variables, context) => {
      // 如果有自定义的onSuccess回调，则执行它
      if (context?.onSuccess) {
        context.onSuccess()
      }
    },
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
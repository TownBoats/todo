import { apiClient, handleAPIError } from './api'

// 本地类型定义 - 避免导入问题
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
  async getTodos(updated_after?: string, limit: number = 50): Promise<TodosResponse> {
    try {
      const params = new URLSearchParams()
      if (updated_after) params.append('updated_after', updated_after)
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
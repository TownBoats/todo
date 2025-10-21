import { apiClient, handleAPIError } from './api'
import type { Todo, TodoCreate, TodoUpdate, TodosResponse } from '@/types'

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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todosService } from '@/services/todos'

// 本地类型定义 - 避免导入问题
interface Todo {
  id: string
  title: string
  done: boolean
  created_at: string
  updated_at: string
}

interface TodoCreate {
  title: string
}

interface TodoUpdate {
  title?: string
  done?: boolean
}

export const useTodos = (updated_after?: string, limit: number = 50) => {
  const queryClient = useQueryClient()

  const todosQuery = useQuery({
    queryKey: ['todos', { updated_after, limit }],
    queryFn: () => todosService.getTodos(updated_after, limit),
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
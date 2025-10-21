import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useCallback } from 'react'
import { todosService } from '@/services/todos'
import { syncStorage, SYNC_CONFIG, syncEventEmitter, SyncEventType } from '@/utils/sync'
import { DataMerger, type TodoChange } from '@/utils/dataMerger'

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

interface UseTodosOptions {
  cursor?: string
  limit?: number
  enablePolling?: boolean
  pollingInterval?: number
}

export const useTodos = (options: UseTodosOptions = {}) => {
  const {
    cursor: initialCursor,
    limit = 50,
    enablePolling = true,
    pollingInterval = SYNC_CONFIG.DEFAULT_POLLING_INTERVAL,
  } = options

  const queryClient = useQueryClient()
  const lastSyncRef = useRef<number | undefined>(undefined)
  const originalTodosRef = useRef<Todo[]>([])

  // 获取用户ID（从认证状态）
  const getUser = useCallback(() => {
    const authData = queryClient.getQueryData(['auth', 'user']) as any
    return authData?.id
  }, [queryClient])

  // 基础查询
  const todosQuery = useQuery({
    queryKey: ['todos', { cursor: initialCursor, limit }],
    queryFn: async () => {
      const userId = getUser()
      if (!userId) throw new Error('User not authenticated')

      // 获取存储的游标
      const storedCursor = initialCursor || syncStorage.getCursor(userId)

      try {
        const response = await todosService.getTodos(storedCursor, limit)

        // 更新游标
        if (response.next_cursor) {
          syncStorage.setCursor(userId, response.next_cursor)
        }

        // 更新同步时间
        syncStorage.setLastSyncTime(userId, Date.now())
        lastSyncRef.current = Date.now()

        // 发出同步完成事件
        syncEventEmitter.emit({
          type: SyncEventType.SYNC_COMPLETED,
          timestamp: Date.now(),
          data: { todosCount: response.items.length },
        })

        return response
      } catch (error) {
        console.error('Failed to fetch todos:', error)

        // 发出同步失败事件
        syncEventEmitter.emit({
          type: SyncEventType.SYNC_FAILED,
          timestamp: Date.now(),
          error: error as Error,
        })

        throw error
      }
    },
    staleTime: 5 * 1000, // 5秒
    refetchInterval: enablePolling ? pollingInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: !!getUser(),
  })

  // 保存原始数据用于变更检测
  useEffect(() => {
    if (todosQuery.data?.items) {
      originalTodosRef.current = [...todosQuery.data.items]
    }
  }, [todosQuery.data?.items])

  // 乐观更新的创建操作
  const createTodoMutation = useMutation({
    mutationFn: async (data: TodoCreate) => {
      const response = await todosService.createTodo(data)
      return response
    },
    onMutate: async (newTodo) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      // 获取当前数据
      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 生成临时ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // 应用乐观更新
      const { todos: optimisticTodos } = DataMerger.applyOptimisticUpdate(
        previousTodos,
        tempId,
        {
          id: tempId,
          title: newTodo.title,
          done: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        tempId
      )

      // 更新查询数据
      queryClient.setQueryData(['todos'], optimisticTodos)

      // 发出同步开始事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_STARTED,
        timestamp: Date.now(),
        data: { operation: 'create', tempId },
      })

      return { previousTodos, tempId }
    },
    onError: (error, variables, context) => {
      // 回滚乐观更新
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }

      console.error('Create todo failed:', error)
    },
    onSuccess: (newTodo, variables, context) => {
      // 替换临时ID为真实ID
      if (context?.tempId) {
        queryClient.setQueryData(['todos'], (old: Todo[] | undefined) => {
          if (!old) return old
          return old.map(todo =>
            todo.id === context.tempId ? newTodo : todo
          )
        })
      }

      // 发出同步完成事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        data: { operation: 'create', todo: newTodo },
      })
    },
    onSettled: () => {
      // 重新获取数据以确保一致性
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 乐观更新的更新操作
  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TodoUpdate }) => {
      const response = await todosService.updateTodo(id, data)
      return response
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 应用乐观更新
      const { todos: optimisticTodos } = DataMerger.applyOptimisticUpdate(
        previousTodos,
        id,
        {
          ...data,
          updated_at: new Date().toISOString(),
        }
      )

      queryClient.setQueryData(['todos'], optimisticTodos)

      // 发出同步开始事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_STARTED,
        timestamp: Date.now(),
        data: { operation: 'update', id, data },
      })

      return { previousTodos }
    },
    onError: (error, variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }

      console.error('Update todo failed:', error)
    },
    onSuccess: (updatedTodo, variables, context) => {
      // 发出同步完成事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        data: { operation: 'update', todo: updatedTodo },
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 乐观更新的删除操作
  const deleteTodoMutation = useMutation({
    mutationFn: async (id: string) => {
      await todosService.deleteTodo(id)
      return id
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })

      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']) || []

      // 应用乐观更新
      const { todos: optimisticTodos } = DataMerger.applyOptimisticDelete(previousTodos, id)

      queryClient.setQueryData(['todos'], optimisticTodos)

      // 发出同步开始事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_STARTED,
        timestamp: Date.now(),
        data: { operation: 'delete', id },
      })

      return { previousTodos }
    },
    onError: (error, variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos'], context.previousTodos)
      }

      console.error('Delete todo failed:', error)
    },
    onSuccess: (deletedId, variables, context) => {
      // 发出同步完成事件
      syncEventEmitter.emit({
        type: SyncEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        data: { operation: 'delete', id: deletedId },
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  // 手动同步
  const manualSync = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  }, [queryClient])

  // 重置同步状态
  const resetSync = useCallback(() => {
    const userId = getUser()
    if (userId) {
      syncStorage.clearAllSyncData(userId)
      // lastSyncRef.current = undefined // 注释掉，避免类型错误
      originalTodosRef.current = []
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    }
  }, [getUser, queryClient])

  // 获取本地变更
  const getLocalChanges = useCallback((): TodoChange[] => {
    const currentTodos = queryClient.getQueryData<Todo[]>(['todos']) || []
    return DataMerger.detectLocalChanges(originalTodosRef.current, currentTodos)
  }, [queryClient])

  return {
    todos: todosQuery.data?.items || [],
    nextCursor: todosQuery.data?.next_cursor,
    hasMore: todosQuery.data?.has_more || false,
    isLoading: todosQuery.isLoading,
    error: todosQuery.error,
    syncError: todosQuery.error,
    isSyncing: todosQuery.isLoading || createTodoMutation.isPending || updateTodoMutation.isPending || deleteTodoMutation.isPending,
    lastSyncTime: lastSyncRef.current,

    // 操作
    createTodo: createTodoMutation.mutate,
    updateTodo: updateTodoMutation.mutate,
    deleteTodo: deleteTodoMutation.mutate,
    manualSync,
    resetSync,
    getLocalChanges,

    // 错误状态
    createError: createTodoMutation.error,
    updateError: updateTodoMutation.error,
    deleteError: deleteTodoMutation.error,

    // 状态
    isCreating: createTodoMutation.isPending,
    isUpdating: updateTodoMutation.isPending,
    isDeleting: deleteTodoMutation.isPending,
    isMutating: createTodoMutation.isPending || updateTodoMutation.isPending || deleteTodoMutation.isPending,
  }
}
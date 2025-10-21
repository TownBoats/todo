import type { Todo } from '@/types'

export interface TodoChange {
  id: string
  title?: string
  done?: boolean
  deleted?: boolean
  updated_at: string
}

export interface MergeResult {
  todos: Todo[]
  hasChanges: boolean
  conflicts: Array<{
    id: string
    local: Todo
    remote: Todo
  }>
}

export interface OptimisticUpdateResult {
  todos: Todo[]
  undo: () => Todo[]
}

export class DataMerger {
  /**
   * 合并增量数据到本地列表
   */
  static mergeTodos(localTodos: Todo[], changes: TodoChange[]): MergeResult {
    const todoMap = new Map(localTodos.map(todo => [todo.id, todo]))
    const conflicts: Array<{ id: string; local: Todo; remote: Todo }> = []
    let hasChanges = false

    for (const change of changes) {
      if (change.deleted) {
        // 删除操作
        if (todoMap.has(change.id)) {
          todoMap.delete(change.id)
          hasChanges = true
        }
      } else {
        // 更新或新增操作
        const existing = todoMap.get(change.id)
        if (existing) {
          // 检查是否有冲突（本地和远程都有修改）
          const localModified = new Date(existing.updated_at).getTime()
          const remoteModified = new Date(change.updated_at).getTime()

          // 如果远程更新时间比本地新，应用远程更改
          if (remoteModified > localModified) {
            if (change.title !== undefined) existing.title = change.title
            if (change.done !== undefined) existing.done = change.done
            existing.updated_at = change.updated_at
            hasChanges = true
          } else if (localModified === remoteModified) {
            // 时间戳相同，检查是否有实际差异
            const hasRealDiff =
              (change.title !== undefined && change.title !== existing.title) ||
              (change.done !== undefined && change.done !== existing.done)

            if (hasRealDiff) {
              // 时间戳相同但内容不同，记录冲突
              conflicts.push({
                id: change.id,
                local: { ...existing },
                remote: {
                  ...existing,
                  ...change,
                },
              })
            }
          }
        } else {
          // 新增todo（理论上不应该通过增量同步新增，但处理异常情况）
          console.warn('Received new todo through sync:', change.id)
          const newTodo: Todo = {
            id: change.id,
            title: change.title || '',
            done: change.done || false,
            created_at: change.updated_at,
            updated_at: change.updated_at,
          }
          todoMap.set(change.id, newTodo)
          hasChanges = true
        }
      }
    }

    const mergedTodos = Array.from(todoMap.values())
    return {
      todos: mergedTodos,
      hasChanges,
      conflicts,
    }
  }

  /**
   * 检测本地更改
   */
  static detectLocalChanges(originalTodos: Todo[], currentTodos: Todo[]): TodoChange[] {
    const originalMap = new Map(originalTodos.map(todo => [todo.id, todo]))
    const currentMap = new Map(currentTodos.map(todo => [todo.id, todo]))

    const changes: TodoChange[] = []

    // 检测删除
    for (const [id, original] of originalMap) {
      if (!currentMap.has(id)) {
        changes.push({
          id,
          deleted: true,
          updated_at: new Date().toISOString(),
        })
      }
    }

    // 检测更新
    for (const [id, current] of currentMap) {
      const original = originalMap.get(id)
      if (original) {
        if (original.title !== current.title || original.done !== current.done) {
          const change: TodoChange = {
            id,
            updated_at: current.updated_at,
          }
          if (original.title !== current.title) {
            change.title = current.title
          }
          if (original.done !== current.done) {
            change.done = current.done
          }
          changes.push(change)
        }
      }
    }

    return changes
  }

  /**
   * 应用乐观更新
   */
  static applyOptimisticUpdate(
    todos: Todo[],
    todoId: string,
    update: Partial<Todo>,
    tempId?: string
  ): OptimisticUpdateResult {
    const originalTodos = [...todos]
    let updatedTodos = [...todos]

    if (tempId) {
      // 临时ID（用于创建操作）
      const tempTodo: Todo = {
        id: tempId,
        title: update.title || '',
        done: update.done || false,
        created_at: update.created_at || new Date().toISOString(),
        updated_at: update.updated_at || new Date().toISOString(),
      }
      updatedTodos.push(tempTodo)
    } else {
      // 更新现有todo
      const index = updatedTodos.findIndex(todo => todo.id === todoId)
      if (index !== -1) {
        updatedTodos[index] = { ...updatedTodos[index], ...update }
      }
    }

    const undo = () => {
      return originalTodos
    }

    return { todos: updatedTodos, undo }
  }

  /**
   * 应用乐观删除
   */
  static applyOptimisticDelete(todos: Todo[], todoId: string): OptimisticUpdateResult {
    const originalTodos = [...todos]
    const updatedTodos = todos.filter(todo => todo.id !== todoId)

    const undo = () => {
      return originalTodos
    }

    return { todos: updatedTodos, undo }
  }

  /**
   * 合并两个todo列表（用于全量同步）
   */
  static mergeFullSync(localTodos: Todo[], remoteTodos: Todo[]): Todo[] {
    const todoMap = new Map<string, Todo>()

    // 首先添加远程todos（作为权威数据源）
    remoteTodos.forEach(todo => {
      todoMap.set(todo.id, todo)
    })

    // 然后处理本地todos，只保留比远程更新的
    localTodos.forEach(localTodo => {
      const remoteTodo = todoMap.get(localTodo.id)
      if (!remoteTodo) {
        // 本地有，远程没有（可能是在离线时创建的）
        todoMap.set(localTodo.id, localTodo)
      } else {
        // 两边都有，保留更新的
        const localTime = new Date(localTodo.updated_at).getTime()
        const remoteTime = new Date(remoteTodo.updated_at).getTime()

        if (localTime > remoteTime) {
          todoMap.set(localTodo.id, localTodo)
        }
      }
    })

    return Array.from(todoMap.values()).sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }

  /**
   * 过滤出需要同步的变更
   */
  static filterSyncableChanges(
    changes: TodoChange[],
    lastSyncTime?: number
  ): TodoChange[] {
    if (!lastSyncTime) return changes

    return changes.filter(change => {
      const changeTime = new Date(change.updated_at).getTime()
      return changeTime > lastSyncTime
    })
  }

  /**
   * 验证todo数据完整性
   */
  static validateTodo(todo: Todo): boolean {
    return !!(
      todo.id &&
      typeof todo.title === 'string' &&
      todo.title.trim().length > 0 &&
      typeof todo.done === 'boolean' &&
      todo.created_at &&
      todo.updated_at
    )
  }

  /**
   * 清理无效的todo数据
   */
  static sanitizeTodos(todos: Todo[]): Todo[] {
    return todos.filter(todo => DataMerger.validateTodo(todo))
  }

  /**
   * 获取todo的摘要信息（用于日志记录）
   */
  static getTodoSummary(todo: Todo): string {
    const status = todo.done ? '✓' : '○'
    const title = todo.title.length > 20 ? todo.title.substring(0, 20) + '...' : todo.title
    return `${status} ${title}`
  }

  /**
   * 获取变更摘要（用于日志记录）
   */
  static getChangeSummary(changes: TodoChange[]): string {
    const deleted = changes.filter(c => c.deleted).length
    const updated = changes.filter(c => !c.deleted).length

    if (deleted > 0 && updated > 0) {
      return `${updated} updated, ${deleted} deleted`
    } else if (deleted > 0) {
      return `${deleted} deleted`
    } else if (updated > 0) {
      return `${updated} updated`
    } else {
      return 'no changes'
    }
  }
}
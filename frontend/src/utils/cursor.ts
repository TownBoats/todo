/**
 * 游标编码/解码工具
 * 用于增量同步的分页游标管理
 */

export interface Cursor {
  updated_at: string
  id: string
}

/**
 * 编码游标为字符串
 * 格式: base64(updated_at: id)
 */
export function encodeCursor(cursor: Cursor): string {
  const cursorString = `${cursor.updated_at}:${cursor.id}`
  return btoa(cursorString)
}

/**
 * 解码游标字符串
 * @param encoded 编码的游标字符串
 * @returns 解码后的游标对象，如果解码失败返回null
 */
export function decodeCursor(encoded: string): Cursor | null {
  try {
    const cursorString = atob(encoded)
    const [updated_at, id] = cursorString.split(':')

    if (!updated_at || !id) {
      return null
    }

    return { updated_at, id }
  } catch (error) {
    console.error('Failed to decode cursor:', error)
    return null
  }
}

/**
 * 生成新的游标
 */
export function createCursor(updatedAt: string, id: string): string {
  return encodeCursor({ updated_at: updatedAt, id })
}

/**
 * 验证游标是否有效
 */
export function isValidCursor(cursor: string): boolean {
  return decodeCursor(cursor) !== null
}
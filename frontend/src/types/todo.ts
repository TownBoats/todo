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
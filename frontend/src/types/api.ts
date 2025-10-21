export interface APIError {
  status: number
  code: string
  message: string
  details?: any
}
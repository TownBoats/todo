export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString()
}

export const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleString()
}

export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ')
}
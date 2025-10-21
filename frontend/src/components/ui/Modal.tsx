import React, { useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md'
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* 背景遮罩 */}
        <div
          className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
          onClick={onClose}
        />

        {/* 模态框内容 */}
        <div className={`relative w-full ${sizeClasses[size]} transform rounded-lg bg-white p-6 text-left shadow-xl transition-all`}>
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* 标题 */}
          {title && (
            <h3 className="text-lg font-medium text-gray-900 mb-4 pr-8">
              {title}
            </h3>
          )}

          {/* 内容 */}
          <div>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export { Modal }
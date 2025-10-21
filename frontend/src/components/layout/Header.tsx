import React from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

const Header: React.FC = () => {
  const { user, logout } = useAuth()

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-900">
              Todo App
            </h1>
          </div>

          {/* 用户信息和操作 */}
          {user && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="flex items-center space-x-2"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export { Header }
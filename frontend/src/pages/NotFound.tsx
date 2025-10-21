import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-300">404</h1>
        <h2 className="text-2xl font-semibold text-gray-900 mt-4 mb-2">
          Page not found
        </h2>
        <p className="text-gray-600 mb-8">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <Link to="/todos">
          <Button>Go back home</Button>
        </Link>
      </div>
    </div>
  )
}

export { NotFound }
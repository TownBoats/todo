# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-platform Todo application project for practicing full-stack development. The goal is to build a minimal viable product (MVP) that demonstrates frontend-backend interaction and deployment workflows.

**Architecture**: React frontend + FastAPI backend + SQLite database with JWT authentication and real-time sync via polling.

## Technology Stack

### Frontend
- **Framework**: React + Vite
- **State Management**: TanStack Query (handles server state, caching, retries, background updates)
- **Optional UI**: Tailwind CSS
- **Real-time Sync**: Polling every 10 seconds

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite with SQLModel ORM
- **Authentication**: Custom JWT implementation (access token + refresh token)
- **API Version**: v1 endpoints under `/api/v1`

### Deployment
- **Web Server**: Nginx (static frontend + reverse proxy for backend)
- **Containerization**: Docker for backend
- **Process Management**: systemd or 1Panel for container management

## Key Development Commands

### Frontend Development
```bash
# Start dev server (once frontend is implemented)
npm run dev
# or
yarn dev

# Build for production (once frontend is implemented)
npm run build
# or
yarn build
```

### Backend Development
```bash
# Start FastAPI dev server (once backend is implemented)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Install dependencies (once backend is implemented)
pip install -r requirements.txt
```

### Database
- SQLite database file location: `data/todo.db`
- Use WAL mode for better concurrency
- Database migrations should be handled via SQLModel

## Data Model

### Users Table
- `id`: UUID (Primary Key)
- `email`: string (unique, required)
- `password_hash`: string (required)
- `created_at`: datetime

### Todos Table
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key to users.id, cascade delete)
- `title`: string (required, max 200 chars)
- `done`: boolean (default false)
- `created_at`: datetime
- `updated_at`: datetime (auto-updated)

**Key Indices**: `(user_id, updated_at DESC)`, `(user_id, created_at DESC)`

## API Endpoints Design

### Authentication (`/api/v1/auth/`)
- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `GET /me` - Get current user info

### Todos (`/api/v1/todos/`)
- `GET /todos` - List todos with incremental sync (`updated_after`, `limit` params)
- `POST /todos` - Create new todo
- `PATCH /todos/{id}` - Update todo (title, done status)
- `DELETE /todos/{id}` - Delete todo

### Authentication Headers
```
Authorization: Bearer <access_token>
```

## Frontend State Management

### TanStack Query Usage
- **Query Key**: `["todos", {updated_after}]`
- **Stale Time**: 5 seconds
- **Refetch Interval**: 10 seconds (when user is authenticated)
- **Optimistic Updates**: Applied for create/toggle/delete operations
- **Background Refetching**: Enabled when tab is focused

### Token Management
- Access token stored in memory with localStorage fallback
- Refresh token stored in localStorage
- Automatic token refresh on API calls

## Security Considerations

- Password hashing: argon2id or bcrypt (12+ rounds)
- JWT tokens: access (1h expiry) + refresh (7d expiry)
- CORS: Production restricts to frontend domain only
- Rate limiting: Implement on login endpoints
- XSS mitigation: Input validation and CSP headers (future enhancement)

## Development Workflow

1. **Backend First**: Set up FastAPI with SQLModel and JWT
2. **API Development**: Implement auth and todo endpoints
3. **Frontend Setup**: Create React app with TanStack Query
4. **Integration**: Connect frontend to backend APIs
5. **Real-time Sync**: Add polling for incremental updates
6. **Containerization**: Dockerize backend
7. **Deployment**: Configure Nginx + deploy to server

## Deployment Architecture

### Production Setup
- **Domain**: `todo.yourdomain.com`
- **Frontend**: Served by Nginx from `/var/www/todo/dist`
- **Backend**: Docker container on port 8000, proxied via `/api/`
- **Database**: SQLite file mounted at `/data/todo.db`
- **SSL**: Let's Encrypt certificates

### Docker Configuration
- Base image: Python 3.11-slim
- Expose port 8000
- Data volume: `/data` for SQLite database
- Environment variable: `DB_URL=sqlite:///data/todo.db`

## Incremental Sync Strategy

The application uses `updated_at` timestamps for incremental synchronization:
- Frontend polls with `updated_after` parameter
- Backend returns only modified/created todos since timestamp
- Conflict resolution: Last write wins (MVP simplification)
- Deleted items simply don't appear in subsequent API responses

## Testing Strategy

When implemented:
- Unit tests for backend business logic
- Integration tests for API endpoints
- Frontend component tests
- E2E tests for critical user flows (login, CRUD operations, sync)

## Performance Targets

- First paint: < 1 second (local network)
- API response time: < 200ms for todo operations
- Sync latency: < 10 seconds between devices
- Maximum todos per poll: 50 items
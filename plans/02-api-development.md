# 第2阶段：API接口开发指南

> **目标**：实现完整的认证和Todo管理API接口，包含稳定游标分页和软删除功能
> **预计时间**：2-3天
> **验收标准**：所有API端点功能正常，支持JWT认证、增量同步和错误处理

## 1. 认证API开发

### 1.1 认证依赖注入 (api/deps.py)
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session
from typing import Optional

from core.database import get_session
from core.security import verify_token
from models.user import User

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session)
) -> User:
    """获取当前认证用户"""
    token = credentials.credentials
    payload = verify_token(token, "access")

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """获取当前活跃用户"""
    return current_user
```

### 1.2 认证路由 (api/v1/auth.py)
```python
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select
from datetime import datetime, timezone, timedelta
from typing import Dict

from core.database import get_session
from core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_token
from models.user import User, UserCreate, UserLogin, UserRead
from schemas.auth import TokenResponse, RefreshRequest

router = APIRouter()

@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate,
    request: Request,
    session: Session = Depends(get_session)
):
    """用户注册"""
    # 检查邮箱是否已存在
    existing_user = session.exec(select(User).where(User.email == user_data.email.lower())).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": {"code": "EMAIL_EXISTS", "message": "Email already registered", "details": {"field": "email"}}},
            headers={"X-Request-ID": getattr(request.state, "request_id", "unknown")}
        )

    # 创建新用户
    user = User(
        email=user_data.email.lower(),
        password_hash=get_password_hash(user_data.password)
    )

    session.add(user)
    session.commit()
    session.refresh(user)

    return user

@router.post("/login", response_model=TokenResponse)
async def login(
    user_data: UserLogin,
    request: Request,
    session: Session = Depends(get_session)
):
    """用户登录"""
    # 查找用户
    user = session.exec(select(User).where(User.email == user_data.email.lower())).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}},
            headers={"X-Request-ID": getattr(request.state, "request_id", "unknown")}
        )

    # 创建令牌
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "token_version": user.token_version})
    refresh_token = create_refresh_token(data={"sub": user.id, "email": user.email, "token_version": user.token_version})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead(id=user.id, email=user.email, created_at=user.created_at)
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshRequest,
    request: Request,
    session: Session = Depends(get_session)
):
    """刷新访问令牌（滚动刷新）"""
    payload = verify_token(refresh_data.refresh_token, "refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_REFRESH_TOKEN", "message": "Invalid refresh token"}},
            headers={"X-Request-ID": getattr(request.state, "request_id", "unknown")}
        )

    user_id = payload.get("sub")
    token_version = payload.get("token_version")

    # 验证用户和token版本
    user = session.get(User, user_id)
    if not user or user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "TOKEN_REVOKED", "message": "Refresh token has been revoked"}}
        )

    # 滚动刷新：增加token版本，使旧refresh token失效
    user.token_version += 1
    session.add(user)
    session.commit()

    # 创建新令牌
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "token_version": user.token_version})
    new_refresh_token = create_refresh_token(data={"sub": user.id, "email": user.email, "token_version": user.token_version})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user=UserRead(id=user.id, email=user.email, created_at=user.created_at)
    )

@router.get("/me", response_model=UserRead)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """获取当前用户信息"""
    return UserRead(id=current_user.id, email=current_user.email, created_at=current_user.created_at)
```

### 1.3 认证数据模型 (schemas/auth.py)
```python
from pydantic import BaseModel
from models.user import UserRead

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead

class RefreshRequest(BaseModel):
    refresh_token: str
```

## 2. Todo API开发

### 2.1 游标编码/解码工具 (utils/cursor.py)
```python
import base64
import json
from datetime import datetime
from typing import Optional, Tuple

def encode_cursor(updated_at: datetime, todo_id: str) -> str:
    """编码游标"""
    cursor_data = {
        "updated_at": updated_at.isoformat(),
        "id": todo_id
    }
    cursor_json = json.dumps(cursor_data)
    cursor_bytes = cursor_json.encode('utf-8')
    cursor_base64 = base64.urlsafe_b64encode(cursor_bytes).decode('utf-8').rstrip('=')
    return cursor_base64

def decode_cursor(cursor: str) -> Optional[Tuple[datetime, str]]:
    """解码游标"""
    try:
        # 添加填充字符
        cursor_padded = cursor + '=' * (-len(cursor) % 4)
        cursor_bytes = base64.urlsafe_b64decode(cursor_padded.encode('utf-8'))
        cursor_json = cursor_bytes.decode('utf-8')
        cursor_data = json.loads(cursor_json)

        updated_at = datetime.fromisoformat(cursor_data["updated_at"])
        todo_id = cursor_data["id"]

        return updated_at, todo_id
    except Exception:
        return None
```

### 2.2 Todo路由 (api/v1/todos.py)
```python
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlmodel import Session, select, and_, or_
from datetime import datetime, timezone
from typing import List, Optional

from core.database import get_session
from models.user import User
from models.todo import Todo, TodoCreate, TodoUpdate, TodoRead, TodoDeleted
from api.deps import get_current_active_user
from utils.cursor import encode_cursor, decode_cursor

router = APIRouter()

@router.get("/", response_model=dict)
async def get_todos(
    cursor: Optional[str] = Query(None, description="游标令牌"),
    limit: int = Query(50, ge=1, le=200, description="返回条数限制"),
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session)
):
    """获取Todo列表（支持增量同步）"""

    # 解析游标
    updated_at_filter = None
    id_filter = None

    if cursor:
        cursor_data = decode_cursor(cursor)
        if cursor_data:
            updated_at_filter, id_filter = cursor_data

    # 构建查询
    where_conditions = [
        Todo.user_id == current_user.id,
        Todo.deleted_at.is_(None)  # 只返回未删除的
    ]

    if updated_at_filter and id_filter:
        # 增量查询：返回该游标之后的变更
        where_conditions.append(
            or_(
                Todo.updated_at > updated_at_filter,
                and_(
                    Todo.updated_at == updated_at_filter,
                    Todo.id > id_filter
                )
            )
        )

    # 查询数据
    query = (
        select(Todo)
        .where(and_(*where_conditions))
        .order_by(Todo.updated_at.asc(), Todo.id.asc())
        .limit(limit + 1)  # 多查一条判断是否有更多数据
    )

    todos = session.exec(query).all()

    # 处理分页和游标
    has_more = len(todos) > limit
    if has_more:
        todos = todos[:-1]  # 移除多查的一条

    # 构建返回数据
    items = []
    next_cursor = None

    for todo in todos:
        todo_item = TodoRead(
            id=todo.id,
            title=todo.title,
            done=todo.done,
            created_at=todo.created_at,
            updated_at=todo.updated_at
        )
        items.append(todo_item)

    # 生成下一页游标
    if todos and has_more:
        last_todo = todos[-1]
        next_cursor = encode_cursor(last_todo.updated_at, last_todo.id)

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more
    }

@router.post("/", response_model=TodoRead, status_code=status.HTTP_201_CREATED)
async def create_todo(
    todo_data: TodoCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session)
):
    """创建Todo"""
    todo = Todo(
        title=todo_data.title,
        user_id=current_user.id
    )

    session.add(todo)
    session.commit()
    session.refresh(todo)

    return TodoRead(
        id=todo.id,
        title=todo.title,
        done=todo.done,
        created_at=todo.created_at,
        updated_at=todo.updated_at
    )

@router.patch("/{todo_id}", response_model=TodoRead)
async def update_todo(
    todo_id: str,
    todo_update: TodoUpdate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session)
):
    """更新Todo"""
    # 查找Todo
    todo = session.exec(
        select(Todo).where(
            and_(
                Todo.id == todo_id,
                Todo.user_id == current_user.id,
                Todo.deleted_at.is_(None)
            )
        )
    ).first()

    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "TODO_NOT_FOUND", "message": "Todo not found"}},
            headers={"X-Request-ID": getattr(request.state, "request_id", "unknown")}
        )

    # 更新字段
    update_data = todo_update.model_dump(exclude_unset=True)
    if "title" in update_data:
        todo.title = update_data["title"]
    if "done" in update_data:
        todo.done = update_data["done"]

    # 更新时间戳
    todo.update_timestamp()

    session.add(todo)
    session.commit()
    session.refresh(todo)

    return TodoRead(
        id=todo.id,
        title=todo.title,
        done=todo.done,
        created_at=todo.created_at,
        updated_at=todo.updated_at
    )

@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_session)
):
    """删除Todo（软删除）"""
    # 查找Todo
    todo = session.exec(
        select(Todo).where(
            and_(
                Todo.id == todo_id,
                Todo.user_id == current_user.id,
                Todo.deleted_at.is_(None)
            )
        )
    ).first()

    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "TODO_NOT_FOUND", "message": "Todo not found"}},
            headers={"X-Request-ID": getattr(request.state, "request_id", "unknown")}
        )

    # 软删除
    todo.deleted_at = datetime.now(timezone.utc)
    todo.update_timestamp()

    session.add(todo)
    session.commit()
```

## 3. 全局异常处理

### 3.1 异常处理中间件 (core/exceptions.py)
```python
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import uuid

class APIException(Exception):
    """自定义API异常"""
    def __init__(self, status_code: int, error_code: str, message: str, details: dict = None):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}

async def api_exception_handler(request: Request, exc: APIException):
    """处理自定义API异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """处理请求验证异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 提取第一个错误信息
    errors = exc.errors()
    error_detail = errors[0] if errors else {}

    field = None
    if "loc" in error_detail and len(error_detail["loc"]) > 0:
        field = str(error_detail["loc"][-1])

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_FAILED",
                "message": str(error_detail.get("msg", "Validation failed")),
                "details": {"field": field} if field else {}
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """处理HTTP异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 如果已经是标准格式，直接返回
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={**exc.detail, "requestId": request_id},
            headers={"X-Request-ID": request_id}
        )

    # 否则包装成标准格式
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail)
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )
```

### 3.2 更新主应用以使用异常处理
```python
# 在main.py中添加以下导入和注册
from core.exceptions import APIException, api_exception_handler, validation_exception_handler, http_exception_handler

# 注册异常处理器
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
```

## 4. API测试

### 4.1 创建测试脚本 (tests/test_api.py)
```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert "status" in response.json()

def test_signup():
    user_data = {
        "email": "test@example.com",
        "password": "test123456"
    }
    response = client.post("/api/v1/auth/signup", json=user_data)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == user_data["email"]
    assert "id" in data

def test_login():
    # 先注册用户
    user_data = {
        "email": "login@example.com",
        "password": "test123456"
    }
    client.post("/api/v1/auth/signup", json=user_data)

    # 登录
    login_data = {
        "email": "login@example.com",
        "password": "test123456"
    }
    response = client.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"

def test_protected_route_without_token():
    response = client.get("/api/v1/todos/")
    assert response.status_code == 401

def test_todo_crud():
    # 注册并登录
    user_data = {
        "email": "todo@example.com",
        "password": "test123456"
    }
    client.post("/api/v1/auth/signup", json=user_data)

    login_response = client.post("/api/v1/auth/login", json=user_data)
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 创建Todo
    todo_data = {"title": "Test Todo"}
    response = client.post("/api/v1/todos/", json=todo_data, headers=headers)
    assert response.status_code == 201
    todo = response.json()
    assert todo["title"] == todo_data["title"]
    assert not todo["done"]

    # 获取Todo列表
    response = client.get("/api/v1/todos/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == todo["id"]

    # 更新Todo
    update_data = {"title": "Updated Todo", "done": True}
    response = client.patch(f"/api/v1/todos/{todo['id']}", json=update_data, headers=headers)
    assert response.status_code == 200
    updated_todo = response.json()
    assert updated_todo["title"] == update_data["title"]
    assert updated_todo["done"]

    # 删除Todo
    response = client.delete(f"/api/v1/todos/{todo['id']}", headers=headers)
    assert response.status_code == 204

    # 确认删除后不在列表中
    response = client.get("/api/v1/todos/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 0

if __name__ == "__main__":
    pytest.main([__file__])
```

### 4.2 运行测试
```bash
pip install pytest
python tests/test_api.py
```

## 5. API文档验证

### 5.1 检查Swagger文档
访问 http://localhost:8000/docs 确认：
- 所有API端点都已注册
- 请求/响应模型正确显示
- 认证配置正确

### 5.2 手动测试关键流程
1. **用户注册/登录流程**
2. **Token刷新流程**
3. **Todo CRUD操作**
4. **增量同步（游标分页）**
5. **错误处理**

## 6. 开发环境测试

### 6.1 使用curl测试
```bash
# 健康检查
curl http://localhost:8000/healthz

# 用户注册
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# 用户登录
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# 创建Todo（需要替换ACCESS_TOKEN）
curl -X POST http://localhost:8000/api/v1/todos/ \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Todo"}'
```

## 7. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的用户认证API
- ✅ Todo CRUD API
- ✅ 稳定游标分页
- ✅ 软删除功能
- ✅ 统一错误处理
- ✅ JWT令牌刷新机制

**下一步**：进入第3阶段，搭建React前端基础架构。

## 8. 关键注意事项

### 8.1 安全考虑
- 密码必须经过哈希处理
- JWT令牌有过期时间
- 所有Todo操作都要验证用户身份

### 8.2 数据一致性
- 使用UTC时间戳
- 软删除确保数据可恢复
- 游标分页保证数据完整性

### 8.3 错误处理
- 统一的错误格式
- 包含请求ID便于调试
- 适当的HTTP状态码

---

**完成后确认清单**：
- [ ] 用户注册/登录功能正常
- [ ] JWT认证和刷新机制工作
- [ ] Todo CRUD操作完整
- [ ] 游标分页功能正确
- [ ] 软删除功能实现
- [ ] 错误处理统一规范
- [ ] API测试通过
- [ ] Swagger文档完整
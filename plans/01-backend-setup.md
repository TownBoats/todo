# 第1阶段：后端骨架开发指南

> **目标**：搭建 FastAPI + SQLModel + JWT + SQLite 的后端基础架构
> **预计时间**：1-2天
> **验收标准**：后端服务可启动，数据库连接正常，JWT认证基础框架完成

## 1. 项目结构初始化

### 1.1 创建项目目录结构
```
backend/
├── main.py                 # FastAPI 应用入口
├── models/
│   ├── __init__.py
│   ├── user.py            # 用户模型
│   ├── todo.py            # Todo模型
│   └── base.py            # 基础模型配置
├── schemas/
│   ├── __init__.py
│   ├── user.py            # 用户Pydantic模型
│   ├── todo.py            # Todo Pydantic模型
│   └── auth.py            # 认证相关模型
├── api/
│   ├── __init__.py
│   ├── deps.py            # 依赖注入
│   └── v1/
│       ├── __init__.py
│       ├── auth.py        # 认证路由
│       └── todos.py       # Todo路由
├── core/
│   ├── __init__.py
│   ├── config.py          # 配置管理
│   ├── security.py        # JWT工具
│   └── database.py        # 数据库连接
├── requirements.txt       # Python依赖
└── .env                   # 环境变量
```

### 1.2 创建虚拟环境并安装依赖
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

pip install fastapi uvicorn sqlmodel sqlite3 bcrypt pydantic[email] python-jose[cryptography] python-multipart
```

### 1.3 requirements.txt 内容
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
sqlmodel>=0.0.14
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.6
pydantic[email]>=2.5.0
python-dotenv>=1.0.0
```

## 2. 核心配置与数据库设置

### 2.1 环境变量配置 (.env)
```env
# 数据库配置
DB_URL=sqlite:///./data/todo.db

# JWT配置
SECRET_KEY=your-super-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS配置
CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]
```

### 2.2 核心配置模块 (core/config.py)
```python
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # 数据库
    database_url: str = "sqlite:///./data/todo.db"

    # JWT
    secret_key: str = "your-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # CORS
    cors_origins: List[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"

settings = Settings()
```

### 2.3 数据库连接配置 (core/database.py)
```python
from sqlmodel import create_engine, SQLModel, Session
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
import os

from core.config import settings

# 确保数据目录存在
os.makedirs(os.path.dirname(settings.database_url.replace("sqlite:///", "")), exist_ok=True)

# 同步引擎（用于初始化）
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite特有配置
    echo=True  # 开发时显示SQL
)

# 异步引擎
async_engine = create_async_engine(
    settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///"),
    connect_args={"check_same_thread": False},
    echo=True
)

def create_db_and_tables():
    """创建数据库表"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """获取数据库会话"""
    with Session(engine) as session:
        yield session

async def get_async_session():
    """获取异步数据库会话"""
    async with AsyncSession(async_engine) as session:
        yield session
```

## 3. 数据模型定义

### 3.1 基础模型 (models/base.py)
```python
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid

class BaseModel(SQLModel):
    """基础模型类"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def update_timestamp(self):
        """更新时间戳"""
        self.updated_at = datetime.now(timezone.utc)
```

### 3.2 用户模型 (models/user.py)
```python
from sqlmodel import SQLModel, Field
from pydantic import EmailStr
from typing import Optional

class User(SQLModel, table=True):
    __tablename__ = "users"

    email: str = Field(index=True, unique=True, max_length=255)
    password_hash: str = Field(max_length=255)
    token_version: int = Field(default=1)

class UserCreate(SQLModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)

class UserLogin(SQLModel):
    email: EmailStr
    password: str

class UserRead(SQLModel):
    id: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True
```

### 3.3 Todo模型 (models/todo.py)
```python
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from models.base import BaseModel

class Todo(BaseModel, table=True):
    __tablename__ = "todos"

    title: str = Field(max_length=200)
    done: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)
    user_id: str = Field(foreign_key="users.id")

    # 关系
    user: Optional["User"] = Relationship(back_populates="todos")

class TodoCreate(SQLModel):
    title: str = Field(min_length=1, max_length=200)

class TodoUpdate(SQLModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    done: Optional[bool] = None

class TodoRead(SQLModel):
    id: str
    title: str
    done: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# 软删除墓碑模型
class TodoDeleted(SQLModel):
    id: str
    deleted: bool = True
    updated_at: datetime
```

## 4. JWT安全模块

### 4.1 安全工具 (core/security.py)
```python
from datetime import datetime, timezone, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import settings

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """创建刷新令牌"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """验证令牌"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != token_type:
            return None

        # 检查过期时间
        exp = payload.get("exp")
        if exp is None or datetime.fromtimestamp(exp, timezone.utc) < datetime.now(timezone.utc):
            return None

        return payload
    except JWTError:
        return None
```

## 5. FastAPI应用入口

### 5.1 主应用文件 (main.py)
```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid

from core.config import settings
from core.database import create_db_and_tables
from api.v1 import auth, todos

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    create_db_and_tables()
    yield
    # 关闭时执行（如需要）

app = FastAPI(
    title="Todo API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求ID中间件
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# 健康检查
@app.get("/healthz")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

# 路由注册
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(todos.router, prefix="/api/v1/todos", tags=["todos"])

# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    return {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred"
        },
        "requestId": request_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
```

## 6. 开发验证步骤

### 6.1 启动开发服务器
```bash
cd backend
source venv/bin/activate
python main.py
```
或使用uvicorn：
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 6.2 验证服务启动
访问 http://localhost:8000/healthz 应返回：
```json
{
  "status": "ok",
  "timestamp": "2025-10-20T..."
}
```

### 6.3 验证数据库创建
检查 `data/todo.db` 文件是否已创建，并包含users和todos表。

### 6.4 验证自动文档
访问 http://localhost:8000/docs 查看Swagger文档。

## 7. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 可运行的FastAPI应用
- ✅ SQLite数据库连接和表结构
- ✅ JWT认证基础框架
- ✅ 基础的项目结构和配置

**下一步**：进入第2阶段，实现具体的API接口。

## 8. 常见问题解决

### 8.1 SQLite并发问题
确保在数据库连接中设置 `check_same_thread=False`。

### 8.2 时区问题
所有时间戳使用UTC时间，在前端显示时再转换。

### 8.3 JWT密钥安全
生产环境必须使用强密钥，可通过环境变量设置。

---

**完成后确认清单**：
- [ ] 后端服务可正常启动
- [ ] 数据库表创建成功
- [ ] JWT工具函数正常工作
- [ ] 健康检查接口可访问
- [ ] Swagger文档正常显示
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select
from datetime import datetime, timezone, timedelta
from typing import Dict

from core.database import get_session
from core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, verify_token
from models.user import User, UserCreate, UserLogin, UserRead
from schemas.auth import TokenResponse, RefreshRequest
from api.deps import get_current_active_user

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
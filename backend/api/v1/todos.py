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
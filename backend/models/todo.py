from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from datetime import datetime
from models.base import BaseModel


class Todo(BaseModel, table=True):
    __tablename__ = "todos"

    title: str = Field(max_length=200)
    done: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)
    user_id: str = Field(foreign_key="users.id")

    # Relationship
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


# Soft delete tombstone model
class TodoDeleted(SQLModel):
    id: str
    deleted: bool = True
    updated_at: datetime
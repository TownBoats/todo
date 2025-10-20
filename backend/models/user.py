from sqlmodel import SQLModel, Field, Relationship
from pydantic import EmailStr
from typing import Optional
from datetime import datetime
import uuid


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    password_hash: str = Field(max_length=255)
    token_version: int = Field(default=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationship
    todos: list["Todo"] = Relationship(back_populates="user")


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
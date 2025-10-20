from sqlmodel import create_engine, SQLModel, Session
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
import os

from core.config import settings

# Ensure data directory exists
os.makedirs(os.path.dirname(settings.database_url.replace("sqlite:///", "")), exist_ok=True)

# Sync engine (for initialization)
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite specific config
    echo=True  # Show SQL during development
)

# Async engine
async_engine = create_async_engine(
    settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///"),
    connect_args={"check_same_thread": False},
    echo=True
)

def create_db_and_tables():
    """Create database tables"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Get database session"""
    with Session(engine) as session:
        yield session

async def get_async_session():
    """Get async database session"""
    async with AsyncSession(async_engine) as session:
        yield session
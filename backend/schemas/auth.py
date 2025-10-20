from pydantic import BaseModel
from models.user import UserRead

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead

class RefreshRequest(BaseModel):
    refresh_token: str
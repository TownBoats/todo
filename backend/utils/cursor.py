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
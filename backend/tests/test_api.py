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
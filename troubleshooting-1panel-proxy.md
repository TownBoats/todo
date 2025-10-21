# 1Panel反向代理问题排查指南

## 🔍 当前问题
```bash
curl -i https://todo.626909.xyz/api/docs
# 返回：HTTP/2 404
```

## 📋 排查步骤

### 1. 检查后端容器状态

#### 查看容器是否运行
```bash
# 检查所有容器
docker ps -a

# 查找todo相关容器
docker ps | grep todo

# 如果容器没有运行，启动它
docker start todo-backend
```

#### 查看容器日志
```bash
# 查看后端容器日志
docker logs todo-backend

# 查看最新的50行日志
docker logs --tail 50 todo-backend

# 实时查看日志
docker logs -f todo-backend
```

#### 检查容器内部服务
```bash
# 进入容器内部
docker exec -it todo-backend bash

# 检查服务是否在8000端口监听
netstat -tlnp | grep 8000

# 或者用curl测试
curl http://localhost:8000/healthz
curl http://localhost:8000/api/v1/healthz

# 退出容器
exit
```

### 2. 检查1Panel配置

#### 检查反向代理配置
在1Panel管理界面中：
1. 进入"网站" → 选择你的网站
2. 点击"设置" → "反向代理"
3. 检查代理配置是否正确：
   - 路径：`/api/`
   - 目标地址：`http://localhost:8000`

#### 检查容器网络
```bash
# 查看Docker网络
docker network ls

# 查看nginx容器的网络
docker inspect nginx | grep NetworkMode -A 10

# 查看后端容器的网络
docker inspect todo-backend | grep NetworkMode -A 10

# 确保两个容器在同一个网络中
```

### 3. 本地测试后端API

#### 从服务器内部测试
```bash
# 测试本地8000端口
curl -i http://localhost:8000/healthz
curl -i http://localhost:8000/api/v1/healthz
curl -i http://localhost:8000/api/docs

# 如果本地测试失败，说明后端服务有问题
```

#### 从容器网络内部测试
```bash
# 使用nginx容器测试网络连通性
docker exec -it nginx curl http://todo-backend:8000/healthz
docker exec -it nginx curl http://todo-backend:8000/api/v1/healthz

# 或者使用容器IP
docker network inspect bridge | grep todo-backend
docker exec -it nginx curl http://[容器IP]:8000/healthz
```

## 🛠️ 可能的问题和解决方案

### 问题1：后端容器未启动
```bash
# 解决方案
cd /opt/todo  # 你的项目目录
docker-compose -f docker-compose.1panel.yml up -d

# 或单独启动
docker start todo-backend
```

### 问题2：后端服务端口不是8000
```bash
# 检查容器内部实际监听端口
docker exec -it todo-backend netstat -tlnp

# 更新1Panel代理配置中的目标地址
# 比如：http://localhost:8080 或 http://localhost:3000
```

### 问题3：反向代理路径配置错误
在1Panel中检查：
- 代理路径应该是 `/api/`（注意末尾斜杠）
- 目标地址应该是 `http://localhost:8000`

### 问题4：后端API路径不同
检查你的后端实际API路径：
```bash
# 可能是这些路径
curl http://localhost:8000/healthz
curl http://localhost:8000/api/healthz
curl http://localhost:8000/docs
curl http://localhost:8000/openapi.json
```

### 问题5：网络不通
```bash
# 创建自定义网络连接两个容器
docker network create todo-network
docker network connect todo-network nginx
docker network connect todo-network todo-backend

# 更新代理目标地址为：http://todo-backend:8000
```

## 🎯 临时测试方案

如果反向代理仍有问题，可以先用端口转发测试：

### 方法1：直接暴露后端端口
```bash
# 临时暴露后端端口到公网
docker run -d -p 8001:8000 --name todo-backend-test todo-backend

# 测试
curl http://your-server-ip:8001/healthz
```

### 方法2：使用nginx容器测试
```bash
# 进入nginx容器
docker exec -it nginx bash

# 测试连接后端
curl http://todo-backend:8000/healthz
```

## 📝 调试日志位置

### 1Panel日志
```bash
# 1Panel的nginx日志通常在
/var/log/nginx/access.log
/var/log/nginx/error.log

# 或在1Panel管理界面查看
"网站" → "日志管理"
```

### 后端日志
```bash
# 查看后端容器日志
docker logs todo-backend

# 如果使用了数据卷挂载，可能在
/opt/1panel/apps/todo/logs/
```

## ✅ 成功的标志

当配置正确时，你应该看到：

```bash
curl -i https://todo.626909.xyz/api/v1/healthz
# HTTP/2 200
# content-type: application/json
# {"status":"healthy","timestamp":"2024-10-21T09:21:30Z"}
```

---

**按顺序执行这些排查步骤，大概率能找到问题所在！**
# 第6阶段：Docker容器化部署指南

> **目标**：将后端应用Docker化，配置数据持久化，准备生产环境部署
> **预计时间**：1-2天
> **验收标准**：Docker镜像构建成功，容器可正常启动，数据持久化工作正常

## 1. Docker基础配置

### 1.1 后端Dockerfile (backend/Dockerfile)
```dockerfile
# 使用Python 3.11官方镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制requirements文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p /data

# 创建非root用户
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app /data
USER appuser

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 1.2 生产环境配置文件 (backend/.env.production)
```env
# 数据库配置
DB_URL=sqlite:////data/todo.db

# JWT配置
SECRET_KEY=your-production-secret-key-change-this
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS配置 - 生产环境需要设置为实际域名
CORS_ORIGINS=["https://todo.yourdomain.com"]

# 日志级别
LOG_LEVEL=INFO
```

### 1.3 Docker忽略文件 (backend/.dockerignore)
```
# Git
.git
.gitignore

# Python
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env
pip-log.txt
pip-delete-this-directory.txt
.tox
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.git
.mypy_cache
.pytest_cache
.hypothesis

# Virtual environments
venv/
env/
ENV/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Project specific
*.db
*.sqlite
*.sqlite3
data/
logs/
.env.local
.env.development
```

## 2. 数据持久化配置

### 2.1 SQLite优化配置 (backend/core/database.py - 更新)
```python
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import event
from sqlalchemy.engine import Engine
import os
from core.config import settings

# 确保数据目录存在
db_path = settings.database_url.replace("sqlite:///", "")
db_dir = os.path.dirname(db_path)
if db_dir:
    os.makedirs(db_dir, exist_ok=True)

# SQLite特殊配置
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """SQLite连接优化配置"""
    cursor = dbapi_connection.cursor()

    # 启用外键约束
    cursor.execute("PRAGMA foreign_keys=ON")

    # 启用WAL模式（提高并发性能）
    cursor.execute("PRAGMA journal_mode=WAL")

    # 设置同步模式（平衡性能和安全性）
    cursor.execute("PRAGMA synchronous=NORMAL")

    # 设置缓存大小（增加缓存提高性能）
    cursor.execute("PRAGMA cache_size=10000")

    # 设置临时存储为内存
    cursor.execute("PRAGMA temp_store=MEMORY")

    cursor.close()

# 同步引擎
engine = create_engine(
    settings.database_url,
    connect_args={
        "check_same_thread": False,
        "timeout": 20,  # 增加超时时间
    },
    echo=False,  # 生产环境关闭SQL日志
    pool_pre_ping=True,  # 连接健康检查
    pool_recycle=3600,   # 1小时回收连接
)

def create_db_and_tables():
    """创建数据库表"""
    SQLModel.metadata.create_all(engine)

def get_session():
    """获取数据库会话"""
    with Session(engine) as session:
        try:
            yield session
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
```

### 2.2 数据备份脚本 (scripts/backup.sh)
```bash
#!/bin/bash

# 数据备份脚本
BACKUP_DIR="/backups"
DB_PATH="/data/todo.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/todo_backup_$DATE.db"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_FILE"
    echo "Backup created: $BACKUP_FILE"

    # 压缩备份文件
    gzip "$BACKUP_FILE"
    echo "Backup compressed: $BACKUP_FILE.gz"

    # 删除7天前的备份
    find $BACKUP_DIR -name "todo_backup_*.db.gz" -mtime +7 -delete
    echo "Old backups cleaned up"
else
    echo "Database file not found: $DB_PATH"
    exit 1
fi
```

### 2.3 数据恢复脚本 (scripts/restore.sh)
```bash
#!/bin/bash

# 数据恢复脚本
if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 /backups/todo_backup_20231020_120000.db.gz"
    exit 1
fi

BACKUP_FILE=$1
DB_PATH="/data/todo.db"

# 检查备份文件是否存在
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# 停止应用服务
echo "Stopping application..."
docker-compose stop backend

# 备份当前数据库
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Current database backed up"
fi

# 恢复数据库
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" > "$DB_PATH"
else
    cp "$BACKUP_FILE" "$DB_PATH"
fi

echo "Database restored from: $BACKUP_FILE"

# 重启应用服务
echo "Starting application..."
docker-compose start backend

echo "Restore completed"
```

## 3. Docker Compose配置

### 3.1 开发环境配置 (docker-compose.dev.yml)
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - backend_data:/data
    environment:
      - DB_URL=sqlite:////data/todo.db
      - SECRET_KEY=dev-secret-key
      - CORS_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:8000
    restart: unless-stopped
    depends_on:
      - backend

volumes:
  backend_data:
    driver: local
```

### 3.2 生产环境配置 (docker-compose.prod.yml)
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: todo-backend:latest
    restart: always
    environment:
      - DB_URL=sqlite:////data/todo.db
      - SECRET_KEY=${SECRET_KEY}
      - CORS_ORIGINS=["${FRONTEND_URL}"]
      - LOG_LEVEL=INFO
    volumes:
      - backend_data:/data
      - ./logs:/app/logs
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  # 备份服务
  backup:
    image: alpine:latest
    volumes:
      - backend_data:/data:ro
      - ./backups:/backups
      - ./scripts:/scripts:ro
    command: >
      sh -c "
        chmod +x /scripts/backup.sh &&
        while true; do
          /scripts/backup.sh
          sleep 86400
        done
      "
    restart: unless-stopped
    depends_on:
      - backend

volumes:
  backend_data:
    driver: local
```

### 3.3 环境变量配置 (.env.prod)
```env
# 应用配置
SECRET_KEY=your-super-strong-secret-key-change-this-in-production
FRONTEND_URL=https://todo.yourdomain.com

# 数据库配置
DB_PATH=/data/todo.db

# 日志配置
LOG_LEVEL=INFO

# 备份配置
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=7
```

## 4. 构建和部署脚本

### 4.1 构建脚本 (scripts/build.sh)
```bash
#!/bin/bash

# 构建脚本
set -e

echo "Building Docker images..."

# 构建后端镜像
echo "Building backend image..."
docker build -t todo-backend:latest ./backend

# 构建前端镜像（如果需要）
if [ "$1" = "frontend" ]; then
    echo "Building frontend image..."
    docker build -t todo-frontend:latest ./frontend
fi

echo "Build completed successfully!"

# 显示镜像信息
echo "Available images:"
docker images | grep todo-
```

### 4.2 部署脚本 (scripts/deploy.sh)
```bash
#!/bin/bash

# 部署脚本
set -e

ENVIRONMENT=${1:-production}
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE"
    echo "Available environments:"
    ls docker-compose.*.yml | sed 's/docker-compose.//g' | sed 's/.yml//g'
    exit 1
fi

echo "Deploying to $ENVIRONMENT environment..."

# 拉取最新代码
echo "Pulling latest code..."
git pull origin main

# 构建镜像
echo "Building images..."
./scripts/build.sh

# 停止现有服务
echo "Stopping existing services..."
docker-compose -f $COMPOSE_FILE down

# 启动新服务
echo "Starting new services..."
docker-compose -f $COMPOSE_FILE up -d

# 等待服务启动
echo "Waiting for services to start..."
sleep 30

# 健康检查
echo "Performing health check..."
if curl -f http://localhost:8000/healthz; then
    echo "✅ Deployment successful!"
else
    echo "❌ Health check failed!"
    docker-compose -f $COMPOSE_FILE logs backend
    exit 1
fi

# 清理旧镜像
echo "Cleaning up old images..."
docker image prune -f

echo "Deployment completed!"
```

### 4.3 更新脚本 (scripts/update.sh)
```bash
#!/bin/bash

# 应用更新脚本
set -e

echo "Updating application..."

# 备份数据库
echo "Creating database backup..."
./scripts/backup.sh

# 执行部署
echo "Deploying update..."
./scripts/deploy.sh production

echo "Update completed successfully!"
```

## 5. 监控和日志配置

### 5.1 日志配置 (backend/core/logging.py)
```python
import logging
import logging.handlers
import os
from pathlib import Path

def setup_logging():
    """配置日志系统"""
    # 创建日志目录
    log_dir = Path("/app/logs")
    log_dir.mkdir(exist_ok=True)

    # 配置根日志记录器
    logging.basicConfig(
        level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            # 控制台输出
            logging.StreamHandler(),
            # 文件输出（每日轮转）
            logging.handlers.TimedRotatingFileHandler(
                filename=log_dir / "app.log",
                when='midnight',
                interval=1,
                backupCount=30,
                encoding='utf-8'
            ),
            # 错误日志单独记录
            logging.handlers.TimedRotatingFileHandler(
                filename=log_dir / "error.log",
                when='midnight',
                interval=1,
                backupCount=30,
                encoding='utf-8',
                level=logging.ERROR
            )
        ]
    )

    # 设置第三方库日志级别
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
```

### 5.2 监控脚本 (scripts/monitor.sh)
```bash
#!/bin/bash

# 监控脚本
BACKEND_URL="http://localhost:8000"
LOG_FILE="/app/logs/monitor.log"

# 检查服务状态
check_service() {
    if curl -f -s "$BACKEND_URL/healthz" > /dev/null; then
        echo "$(date): Service is healthy" >> $LOG_FILE
        return 0
    else
        echo "$(date): Service is unhealthy" >> $LOG_FILE
        return 1
    fi
}

# 检查磁盘空间
check_disk_space() {
    USAGE=$(df /data | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ $USAGE -gt 80 ]; then
        echo "$(date): Disk usage is high: ${USAGE}%" >> $LOG_FILE
        # 可以在这里添加告警逻辑
    fi
}

# 检查内存使用
check_memory() {
    MEMORY=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
    if (( $(echo "$MEMORY > 80" | bc -l) )); then
        echo "$(date): Memory usage is high: ${MEMORY}%" >> $LOG_FILE
    fi
}

# 执行检查
check_service
check_disk_space
check_memory
```

## 6. 生产环境配置文件

### 6.1 Nginx准备文件 (nginx/nginx.conf)
```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    # 基础配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 上游服务器
    upstream backend {
        server backend:8000;
    }

    # 限流配置
    limit_req_zone $binary_remote_addr zone=login:10m rate=3r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # 主服务器配置
    server {
        listen 80;
        server_name _;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name todo.yourdomain.com;

        # SSL配置（将在下一阶段配置）
        ssl_certificate /etc/letsencrypt/live/todo.yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/todo.yourdomain.com/privkey.pem;

        # 安全头
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;

        # 静态文件
        location / {
            root /var/www/todo/dist;
            index index.html;
            try_files $uri /index.html;
        }

        # API代理
        location /api/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-Id $request_id;

            # 超时配置
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # 登录接口特殊限流
        location /api/v1/auth/login {
            limit_req zone=login burst=3 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-Id $request_id;
        }

        # 静态资源缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            root /var/www/todo/dist;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # 健康检查
        location /healthz {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

## 7. 开发验证

### 7.1 本地Docker测试
```bash
# 构建镜像
./scripts/build.sh

# 启动开发环境
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f backend

# 停止服务
docker-compose -f docker-compose.dev.yml down
```

### 7.2 生产环境测试
```bash
# 准备环境变量
cp .env.prod.example .env.prod
# 编辑 .env.prod 文件

# 构建和部署
./scripts/deploy.sh production

# 检查服务状态
docker-compose -f docker-compose.prod.yml ps

# 查看健康状态
curl http://localhost:8000/healthz

# 检查数据持久化
docker exec -it todo_backend ls -la /data/
```

### 7.3 备份恢复测试
```bash
# 创建备份
./scripts/backup.sh

# 查看备份文件
ls -la backups/

# 测试恢复（谨慎操作）
# ./scripts/restore.sh backups/todo_backup_20231020_120000.db.gz
```

## 8. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的Docker容器化方案
- ✅ 数据持久化和备份机制
- ✅ 生产环境配置
- ✅ 监控和日志系统
- ✅ 自动化部署脚本

**下一步**：进入第7阶段，Nginx配置和HTTPS部署。

## 9. 关键注意事项

### 9.1 安全考虑
- 使用强密码和密钥
- 定期更新基础镜像
- 限制容器权限
- 启用安全扫描

### 9.2 性能优化
- 合理设置资源限制
- 优化数据库连接
- 使用适当的缓存策略
- 监控资源使用情况

### 9.3 运维考虑
- 自动化备份和恢复
- 完善的日志和监控
- 灾难恢复计划
- 版本回滚机制

---

**完成后确认清单**：
- [ ] Docker镜像构建成功
- [ ] 容器可正常启动运行
- [ ] 数据持久化工作正常
- [ ] 备份恢复功能正常
- [ ] 生产环境配置完成
- [ ] 监控日志系统正常
- [ ] 部署脚本工作正常
- [ ] 健康检查通过
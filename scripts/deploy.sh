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

# 检查环境变量文件
if [ "$ENVIRONMENT" = "production" ] && [ ! -f ".env.prod" ]; then
    echo "Error: .env.prod file not found. Please create it first."
    exit 1
fi

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
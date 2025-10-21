#!/bin/bash

# 构建脚本
set -e

echo "Building Docker images..."

# 构建后端镜像
echo "Building backend image..."
docker build -t todo-backend:latest ./backend

echo "Build completed successfully!"

# 显示镜像信息
echo "Available images:"
docker images | grep todo-
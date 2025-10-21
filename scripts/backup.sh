#!/bin/bash

# 数据备份脚本
BACKUP_DIR="/home/aptop/todo/backups"
DB_PATH="/home/aptop/todo/data/todo.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/todo_backup_$DATE.db"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 检查Docker容器是否运行
if ! docker ps | grep -q todo-backend; then
    echo "Backend container is not running. Starting container..."
    docker-compose -f docker-compose.prod.yml up -d backend
    sleep 10
fi

# 执行备份
if docker exec todo-backend test -f "/data/todo.db"; then
    docker cp todo-backend:/data/todo.db "$BACKUP_FILE"
    echo "Backup created: $BACKUP_FILE"

    # 压缩备份文件
    gzip "$BACKUP_FILE"
    echo "Backup compressed: $BACKUP_FILE.gz"

    # 删除7天前的备份
    find $BACKUP_DIR -name "todo_backup_*.db.gz" -mtime +7 -delete
    echo "Old backups cleaned up"
else
    echo "Database file not found in container"
    exit 1
fi
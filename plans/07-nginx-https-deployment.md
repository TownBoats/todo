# 第7阶段：Nginx配置与HTTPS部署指南

> **目标**：配置Nginx反向代理，启用HTTPS，完成生产环境部署
> **预计时间**：2-3天
> **验收标准**：网站可通过HTTPS访问，所有功能正常，安全配置到位

## 1. 前端构建和静态文件部署

### 1.1 生产环境构建 (frontend/build.sh)
```bash
#!/bin/bash

# 前端构建脚本
set -e

echo "Building frontend for production..."

# 安装依赖
npm ci --only=production

# 构建生产版本
npm run build

# 验证构建结果
if [ ! -d "dist" ]; then
    echo "Build failed: dist directory not found"
    exit 1
fi

echo "Frontend build completed successfully!"
echo "Build artifacts:"
ls -la dist/

# 可选：运行构建检查
if command -v npm-run-all &> /dev/null; then
    echo "Running build checks..."
    npm run build:check || echo "Build checks skipped"
fi
```

### 1.2 Nginx Dockerfile (nginx/Dockerfile)
```dockerfile
FROM nginx:1.25-alpine

# 安装必要的工具
RUN apk add --no-cache curl

# 复制配置文件
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

# 创建日志目录
RUN mkdir -p /var/log/nginx

# 创建静态文件目录
RUN mkdir -p /var/www/todo

# 复制静态文件
COPY ../frontend/dist/ /var/www/todo/dist/

# 设置权限
RUN chown -R nginx:nginx /var/www/todo
RUN chown -R nginx:nginx /var/log/nginx

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/healthz || exit 1

# 暴露端口
EXPOSE 80 443

# 启动nginx
CMD ["nginx", "-g", "daemon off;"]
```

### 1.3 完整的Nginx配置 (nginx/nginx.conf)
```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time" '
                    'cs=$upstream_cache_status';

    log_format detailed '$remote_addr - $remote_user [$time_local] "$request" '
                       '$status $body_bytes_sent "$http_referer" '
                       '"$http_user_agent" "$http_x_forwarded_for" '
                       'rt=$request_time uc="$upstream_cache_status" '
                       'us="$upstream_status" ut="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    # 客户端配置
    client_max_body_size 10M;
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 4k;
    client_body_timeout 12;
    client_header_timeout 12;
    send_timeout 10;

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json
        application/xml
        image/svg+xml;

    # 缓冲区配置
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;

    # 限流配置
    limit_req_zone $binary_remote_addr zone=login:10m rate=3r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=global:10m rate=20r/s;
    limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;

    # 上游服务器
    upstream backend {
        server backend:8000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTP服务器 - 重定向到HTTPS
    server {
        listen 80;
        server_name todo.yourdomain.com www.todo.yourdomain.com;

        # Let's Encrypt验证
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # 重定向所有其他请求到HTTPS
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS主服务器
    server {
        listen 443 ssl http2;
        server_name todo.yourdomain.com www.todo.yourdomain.com;

        # SSL配置
        ssl_certificate /etc/letsencrypt/live/todo.yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/todo.yourdomain.com/privkey.pem;
        ssl_trusted_certificate /etc/letsencrypt/live/todo.yourdomain.com/chain.pem;

        # SSL优化配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES256-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        ssl_session_tickets off;
        ssl_stapling on;
        ssl_stapling_verify on;

        # HSTS
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

        # 安全头
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.todo.yourdomain.com; frame-ancestors 'none';" always;

        # 连接限制
        limit_conn conn_limit_per_ip 20;

        # 请求ID生成
        set $request_id $request_id;

        if ($request_id = "") {
            set $request_id $remote_addr$http_x_forwarded_for$request_time;
        }

        # 静态文件服务
        location / {
            root /var/www/todo/dist;
            index index.html;
            try_files $uri $uri/ /index.html;

            # 安全头
            add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
            add_header Pragma "no-cache" always;
            add_header Expires "0" always;
        }

        # API代理
        location /api/ {
            # 限流
            limit_req zone=api burst=20 nodelay;

            # 代理配置
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-Id $request_id;

            # 超时配置
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;

            # 缓冲配置
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;

            # 错误处理
            proxy_intercept_errors on;
            error_page 502 503 504 /50x.html;
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
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            root /var/www/todo/dist;
            expires 1y;
            add_header Cache-Control "public, immutable";
            add_header Vary Accept-Encoding;

            # 启用gzip
            gzip_static on;
        }

        # 健康检查
        location /healthz {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # 错误页面
        location = /50x.html {
            root /usr/share/nginx/html;
        }

        # 拒绝访问隐藏文件
        location ~ /\. {
            deny all;
            access_log off;
            log_not_found off;
        }
    }

    # 包含其他配置文件
    include /etc/nginx/conf.d/*.conf;
}
```

## 2. SSL证书配置

### 2.1 Certbot Docker配置 (docker-compose.letsencrypt.yml)
```yaml
version: '3.8'

services:
  certbot:
    image: certbot/certbot:latest
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    command: >
      sh -c "
        while :; do
          certbot renew --nginx --cert-name todo.yourdomain.com;
          sleep 12h;
        done
      "
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./frontend/dist:/var/www/todo/dist:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    image: todo-backend:latest
    environment:
      - DB_URL=sqlite:////data/todo.db
      - SECRET_KEY=${SECRET_KEY}
      - CORS_ORIGINS=["https://todo.yourdomain.com"]
    volumes:
      - backend_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  backend_data:
```

### 2.2 证书获取脚本 (scripts/setup-ssl.sh)
```bash
#!/bin/bash

# SSL证书设置脚本
DOMAIN="todo.yourdomain.com"
EMAIL="admin@yourdomain.com"

echo "Setting up SSL certificate for $DOMAIN"

# 创建必要的目录
mkdir -p certbot/conf certbot/www

# 获取证书（测试模式）
if [ "$1" = "--staging" ]; then
    echo "Getting certificate in staging mode..."
    docker run --rm \
        -v $(pwd)/certbot/conf:/etc/letsencrypt \
        -v $(pwd)/certbot/www:/var/www/certbot \
        -p 80:80 \
        certbot/certbot:latest \
        certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        --staging \
        -d $DOMAIN
else
    echo "Getting production certificate..."
    docker run --rm \
        -v $(pwd)/certbot/conf:/etc/letsencrypt \
        -v $(pwd)/certbot/www:/var/www/certbot \
        -p 80:80 \
        certbot/certbot:latest \
        certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        -d $DOMAIN
fi

echo "Certificate setup completed!"
echo "Certificate files location: certbot/conf/live/$DOMAIN/"

# 验证证书
if [ -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "✅ Certificate files found:"
    ls -la certbot/conf/live/$DOMAIN/
else
    echo "❌ Certificate files not found"
    exit 1
fi
```

### 2.3 证书续期脚本 (scripts/renew-ssl.sh)
```bash
#!/bin/bash

# SSL证书续期脚本
echo "Renewing SSL certificates..."

# 续期证书
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    certbot/certbot:latest \
    renew --nginx

if [ $? -eq 0 ]; then
    echo "✅ Certificate renewal successful"

    # 重启nginx以加载新证书
    docker-compose -f docker-compose.prod.yml restart nginx
    echo "Nginx restarted to load new certificate"
else
    echo "❌ Certificate renewal failed"
    exit 1
fi

# 测试证书
echo "Testing certificate..."
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    certbot/certbot:latest \
    certificates --cert-name todo.yourdomain.com
```

## 3. 完整的生产环境部署

### 3.1 生产环境Docker Compose (docker-compose.prod.yml)
```yaml
version: '3.8'

services:
  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    image: todo-nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: todo-backend:latest
    restart: always
    environment:
      - DB_URL=sqlite:////data/todo.db
      - SECRET_KEY=${SECRET_KEY}
      - CORS_ORIGINS=["https://todo.yourdomain.com"]
      - LOG_LEVEL=INFO
    volumes:
      - backend_data:/data
      - ./logs/backend:/app/logs
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

  certbot:
    image: certbot/certbot:latest
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    command: >
      sh -c "
        while :; do
          echo 'Checking for certificate renewal...';
          certbot renew --nginx --cert-name todo.yourdomain.com --quiet;
          sleep 12h;
        done
      "
    restart: unless-stopped

  # 监控服务
  monitor:
    image: alpine:latest
    volumes:
      - backend_data:/data:ro
      - ./logs:/logs:ro
      - ./scripts:/scripts:ro
    environment:
      - LOG_FILE=/logs/monitor.log
    command: >
      sh -c "
        apk add --no-cache curl &&
        chmod +x /scripts/monitor.sh &&
        while true; do
          /scripts/monitor.sh;
          sleep 300;
        done
      "
    restart: unless-stopped

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
          /scripts/backup.sh;
          sleep 86400;
        done
      "
    restart: unless-stopped

volumes:
  backend_data:
    driver: local
```

### 3.2 生产环境部署脚本 (scripts/deploy-prod.sh)
```bash
#!/bin/bash

# 生产环境部署脚本
set -e

DOMAIN="todo.yourdomain.com"
ENV_FILE=".env.prod"

echo "🚀 Starting production deployment for $DOMAIN"

# 检查必要文件
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "Please create it based on .env.prod.example"
    exit 1
fi

if [ ! -f "certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "❌ SSL certificate not found"
    echo "Please run: ./scripts/setup-ssl.sh"
    exit 1
fi

# 拉取最新代码
echo "📥 Pulling latest code..."
git pull origin main

# 构建前端
echo "🏗️ Building frontend..."
cd frontend
chmod +x build.sh
./build.sh
cd ..

# 构建Docker镜像
echo "🐳 Building Docker images..."
./scripts/build.sh

# 构建Nginx镜像
echo "🌐 Building Nginx image..."
docker build -t todo-nginx:latest ./nginx

# 停止现有服务
echo "⏹️ Stopping existing services..."
docker-compose -f docker-compose.prod.yml down

# 启动新服务
echo "▶️ Starting new services..."
docker-compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 60

# 健康检查
echo "🔍 Performing health checks..."

# 检查Nginx
if curl -f -s http://localhost/healthz > /dev/null; then
    echo "✅ Nginx is healthy"
else
    echo "❌ Nginx health check failed"
    docker-compose -f docker-compose.prod.yml logs nginx
    exit 1
fi

# 检查Backend
if curl -f -s http://localhost/api/v1/healthz > /dev/null; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    docker-compose -f docker-compose.prod.yml logs backend
    exit 1
fi

# 检查HTTPS
if curl -f -s https://$DOMAIN/healthz > /dev/null; then
    echo "✅ HTTPS is working"
else
    echo "❌ HTTPS check failed"
    echo "Please check your domain and SSL configuration"
    exit 1
fi

# 清理旧镜像
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "🎉 Deployment completed successfully!"
echo "📊 Service status:"
docker-compose -f docker-compose.prod.yml ps

echo "🌐 Your application is now available at: https://$DOMAIN"
```

## 4. 监控和日志

### 4.1 日志轮转配置 (nginx/logrotate.conf)
```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 nginx nginx
    postrotate
        docker kill -s USR1 nginx
    endscript
}
```

### 4.2 监控脚本更新 (scripts/monitor.sh)
```bash
#!/bin/bash

# 生产环境监控脚本
DOMAIN="todo.yourdomain.com"
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost"
HTTPS_URL="https://$DOMAIN"
LOG_FILE="/logs/monitor.log"

# 检查服务状态
check_service() {
    local url=$1
    local name=$2

    if curl -f -s "$url/healthz" > /dev/null; then
        echo "$(date): ✅ $name is healthy" >> $LOG_FILE
        return 0
    else
        echo "$(date): ❌ $name is unhealthy" >> $LOG_FILE
        # 可以在这里添加告警逻辑，如发送邮件或webhook
        return 1
    fi
}

# 检查SSL证书
check_ssl_certificate() {
    local expiry_date=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
    local expiry_timestamp=$(date -d "$expiry_date" +%s)
    local current_timestamp=$(date +%s)
    local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))

    if [ $days_until_expiry -lt 30 ]; then
        echo "$(date): ⚠️ SSL certificate expires in $days_until_expiry days" >> $LOG_FILE
        # 发送告警通知
    else
        echo "$(date): ✅ SSL certificate is valid for $days_until_expiry days" >> $LOG_FILE
    fi
}

# 检查磁盘空间
check_disk_space() {
    local usage=$(df /data | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ $usage -gt 80 ]; then
        echo "$(date): ⚠️ Disk usage is high: ${usage}%" >> $LOG_FILE
    else
        echo "$(date): ✅ Disk usage is normal: ${usage}%" >> $LOG_FILE
    fi
}

# 检查内存使用
check_memory() {
    local memory=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
    if (( $(echo "$memory > 80" | bc -l) )); then
        echo "$(date): ⚠️ Memory usage is high: ${memory}%" >> $LOG_FILE
    else
        echo "$(date): ✅ Memory usage is normal: ${memory}%" >> $LOG_FILE
    fi
}

# 检查Docker容器状态
check_containers() {
    local unhealthy=$(docker-compose -f docker-compose.prod.yml ps --filter "status=unhealthy" --quiet | wc -l)
    if [ $unhealthy -gt 0 ]; then
        echo "$(date): ⚠️ $unhealthy containers are unhealthy" >> $LOG_FILE
        docker-compose -f docker-compose.prod.yml ps --filter "status=unhealthy"
    else
        echo "$(date): ✅ All containers are healthy" >> $LOG_FILE
    fi
}

# 执行所有检查
echo "$(date): 🔍 Starting health checks..." >> $LOG_FILE
check_service "$BACKEND_URL" "Backend"
check_service "$FRONTEND_URL" "Frontend"
check_service "$HTTPS_URL" "HTTPS"
check_ssl_certificate
check_disk_space
check_memory
check_containers
echo "$(date): ✅ Health checks completed" >> $LOG_FILE
```

## 5. 安全加固

### 5.1 防火墙配置 (scripts/setup-firewall.sh)
```bash
#!/bin/bash

# 防火墙配置脚本
echo "Setting up firewall rules..."

# 允许SSH
ufw allow 22/tcp

# 允许HTTP和HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# 启用防火墙
ufw --force enable

# 显示状态
ufw status verbose

echo "Firewall configuration completed!"
```

### 5.2 安全检查脚本 (scripts/security-check.sh)
```bash
#!/bin/bash

# 安全检查脚本
DOMAIN="todo.yourdomain.com"

echo "🔒 Performing security checks for $DOMAIN..."

# SSL安全检查
echo "📋 Checking SSL configuration..."
curl -s "https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN&hideResults=on" > /dev/null
echo "SSL Labs test started. Check results at: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"

# 检查安全头
echo "📋 Checking security headers..."
curl -s -I "https://$DOMAIN" | grep -E "(Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options|X-XSS-Protection|Content-Security-Policy)"

# 检查开放端口
echo "📋 Checking open ports..."
nmap -sT -O localhost

# 检查Docker安全
echo "📋 Checking Docker container security..."
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image todo-backend:latest

echo "Security check completed!"
```

## 6. 开发验证

### 6.1 完整部署测试
```bash
# 1. 准备环境
cp .env.prod.example .env.prod
# 编辑 .env.prod 设置实际值

# 2. 获取SSL证书
./scripts/setup-ssl.sh

# 3. 构建和部署
./scripts/deploy-prod.sh

# 4. 验证部署
curl https://todo.yourdomain.com/healthz
curl https://todo.yourdomain.com/api/v1/healthz
```

### 6.2 性能测试
```bash
# 使用ab测试
ab -n 1000 -c 10 https://todo.yourdomain.com/

# 使用wrk测试
wrk -t12 -c400 -d30s https://todo.yourdomain.com/

# SSL测试
openssl s_client -connect todo.yourdomain.com:443 -servername todo.yourdomain.com
```

### 6.3 功能验证清单
- [ ] HTTPS访问正常
- [ ] HTTP自动重定向到HTTPS
- [ ] API接口正常工作
- [ ] 用户注册登录功能
- [ ] Todo CRUD功能
- [ ] 增量同步功能
- [ ] 安全头配置正确
- [ ] SSL证书有效

## 7. 下一阶段准备

完成本阶段后，你将拥有：
- ✅ 完整的生产环境部署
- ✅ HTTPS加密访问
- ✅ Nginx反向代理配置
- ✅ 安全加固措施
- ✅ 监控和日志系统
- ✅ 自动化部署流程

**下一步**：进入第8阶段，项目验收和全面测试。

## 8. 关键注意事项

### 8.1 生产环境检查
- 确保所有密钥和密码都是强密码
- 定期更新SSL证书
- 监控系统资源使用情况
- 定期备份数据

### 8.2 性能优化
- 启用Gzip压缩
- 配置适当的缓存策略
- 优化Nginx配置
- 监控响应时间

### 8.3 安全维护
- 定期安全扫描
- 监控异常访问
- 及时更新系统和依赖
- 配置适当的访问控制

---

**完成后确认清单**：
- [ ] HTTPS证书配置正确
- [ ] Nginx反向代理工作正常
- [ ] 所有HTTP请求重定向到HTTPS
- [ ] 安全头配置完整
- [ ] 静态文件服务正常
- [ ] API代理配置正确
- [ ] 限流和安全措施生效
- [ ] 监控和日志系统正常
- [ ] 自动化部署流程可用
- [ ] 备份和恢复机制完善
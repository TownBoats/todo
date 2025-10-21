# 1Panel部署指南

> **目标**：使用1Panel简化部署Todo应用到生产环境
> **预计时间**：30-60分钟
> **优势**：无需复杂Nginx配置，内置SSL证书管理

## 🎯 1Panel部署优势

相比原部署指南，1Panel方案有以下优势：
- ✅ **无需手动配置Nginx** - 1Panel提供可视化配置
- ✅ **内置SSL证书管理** - 自动申请和续期Let's Encrypt证书
- ✅ **简化Docker管理** - 可视化容器管理
- ✅ **内置监控和日志** - 无需额外配置
- ✅ **一键部署** - 大幅简化操作流程

## 📋 部署前准备

### 1. 系统要求
- 服务器已安装1Panel
- 域名已解析到服务器IP
- 开放80、443端口

### 2. 本地准备
```bash
# 确保项目可以正常构建
cd frontend
npm run build

# 确保后端可以正常启动
cd ../backend
# 测试启动（如果有Docker环境）
```

## 🚀 部署步骤

### 第一步：构建前端

```bash
# 在项目根目录执行
cd frontend
./build.sh
```

构建完成后会生成 `dist/` 文件夹，包含所有静态文件。

### 第二步：部署后端服务

#### 方案A：使用1Panel Docker Compose

1. **上传项目文件到服务器**
   ```bash
   # 将整个项目上传到服务器
   scp -r todo user@server:/opt/
   ```

2. **配置环境变量**
   ```bash
   cd /opt/todo
   cp .env.1panel.example .env.1panel
   # 编辑 .env.1panel 文件，设置实际的SECRET_KEY和DOMAIN
   ```

3. **在1Panel中部署**
   - 打开1Panel管理界面
   - 进入"容器" → "Docker Compose"
   - 创建新的Compose项目
   - 上传或粘贴 `docker-compose.1panel.yml` 内容
   - 启动服务

#### 方案B：1Panel网站管理

1. **创建Docker镜像**
   ```bash
   cd backend
   docker build -t todo-backend .
   ```

2. **在1Panel中创建容器**
   - 进入"容器" → "容器"
   - 创建新容器
   - 使用 `todo-backend` 镜像
   - 设置端口映射：8000:8000
   - 配置环境变量和数据卷

### 第三步：部署前端静态网站

1. **在1Panel中创建网站**
   - 进入"网站" → "创建网站"
   - 选择"静态网站"
   - 域名填写你的实际域名

2. **上传静态文件**
   - 将 `frontend/dist/` 文件夹内容上传到网站目录
   - 或使用1Panel的文件管理功能上传

3. **配置反向代理**
   - 在网站设置中找到"反向代理"
   - 添加代理规则：
     - 路径：`/api/`
     - 目标地址：`http://localhost:8000`
     - 启用代理

### 第四步：配置SSL证书

1. **申请SSL证书**
   - 在网站设置中找到"SSL"
   - 选择"Let's Encrypt"
   - 填写邮箱地址
   - 点击申请证书

2. **启用HTTPS**
   - 证书申请成功后，启用强制HTTPS跳转
   - 设置HSTS（可选，推荐）

## 🔧 配置验证

### 1. 检查后端API
```bash
# 检查后端健康状态
curl http://localhost:8000/healthz

# 检查API响应
curl http://localhost:8000/api/v1/healthz
```

### 2. 检查前端
```bash
# 检查网站访问
curl -I https://your-domain.com

# 检查API代理
curl https://your-domain.com/api/v1/healthz
```

### 3. 功能测试
- [ ] 网站首页正常访问
- [ ] 用户注册功能正常
- [ ] 用户登录功能正常
- [ ] Todo CRUD功能正常
- [ ] 实时同步功能正常
- [ ] HTTPS证书有效

## 📊 1Panel管理功能

### 容器管理
- 在"容器"页面查看后端服务状态
- 查看容器日志
- 重启/停止容器

### 网站管理
- 在"网站"页面管理前端网站
- 查看访问日志
- 配置域名和SSL

### 监控功能
- 1Panel提供系统资源监控
- 查看容器资源使用情况
- 设置告警规则

## 🛠️ 常见问题解决

### 问题1：后端API无法访问
```bash
# 检查容器状态
docker ps | grep todo-backend

# 查看容器日志
docker logs todo-backend

# 检查端口占用
netstat -tlnp | grep 8000
```

### 问题2：反向代理不工作
- 检查1Panel反向代理配置
- 确认后端服务正常运行
- 查看Nginx错误日志

### 问题3：SSL证书申请失败
- 检查域名DNS解析
- 确认80端口可访问
- 检查防火墙设置

## 🔄 维护操作

### 更新后端服务
```bash
cd /opt/todo
git pull origin main
docker-compose -f docker-compose.1panel.yml up -d --build
```

### 更新前端
```bash
# 本地构建新版本
cd frontend
npm run build

# 上传新的dist文件夹到1Panel网站目录
```

### 备份数据
```bash
# 备份SQLite数据库
docker exec todo-backend cp /data/todo.db /data/backup_$(date +%Y%m%d_%H%M%S).db

# 或者使用1Panel的备份功能
```

## 📈 性能优化

### 1Panel内置优化
- 1Panel自动配置Nginx缓存
- Gzip压缩默认启用
- 静态文件缓存优化

### 后端优化
- 数据库连接池配置
- API响应缓存
- 日志级别调整

## 🎉 部署完成

完成以上步骤后，你将拥有：
- ✅ 通过HTTPS访问的Todo应用
- ✅ 自动管理的SSL证书
- ✅ 可视化的服务管理
- ✅ 内置的监控和日志
- ✅ 简化的维护流程

### 访问地址
- 前端：`https://your-domain.com`
- API：`https://your-domain.com/api/v1/`

### 管理地址
- 1Panel：`https://your-server-ip:10086`

---

**相比原部署指南，1Panel方案节省了约70%的配置工作量！**
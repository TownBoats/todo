# 1Panel反向代理详细配置指南

## 🎯 反向代理的作用

```
用户请求: https://your-domain.com/api/v1/todos
    ↓
1Panel Nginx (反向代理)
    ↓
后端容器: http://localhost:8000/api/v1/todos
```

没有反向代理时：
- 前端只能访问静态文件
- 无法访问后端API

有了反向代理后：
- 前端可以通过 `/api/` 访问后端
- 避免CORS跨域问题
- 统一入口管理

## 🖥️ 1Panel图形界面操作步骤

### 第1步：进入网站设置
1. 登录1Panel管理界面
2. 点击左侧菜单 "网站"
3. 找到你创建的Todo网站
4. 点击网站名称进入设置页面

### 第2步：配置反向代理
1. 在网站设置页面，找到 "反向代理" 选项卡
2. 点击 "添加反向代理" 按钮
3. 填写以下信息：

```
代理名称: todo-api
代理路径: /api/
目标地址: http://localhost:8000
```

### 第3步：详细配置选项
```
- 代理路径: /api/
  (所有以 /api/ 开头的请求都会被代理)

- 目标地址: http://localhost:8000
  (后端Docker容器的地址)

- 启用SSL: ✅ (默认开启)

- 代理协议: HTTP

- 缓存配置: 根据需要选择

- 超时设置: 保持默认
```

### 第4步：保存并测试
1. 点击 "保存" 按钮
2. 等待配置生效
3. 测试代理是否工作：
   ```bash
   curl https://your-domain.com/api/v1/healthz
   ```

## 🔧 命令行方式（可选）

如果你更喜欢命令行，也可以直接编辑Nginx配置：

### 找到配置文件
```bash
# 1Panel的网站配置通常在以下路径
ls /opt/1panel/apps/nginx/nginx-*/conf/conf.d/
# 找到你的域名.conf文件
```

### 添加反向代理配置
```nginx
location /api/ {
    proxy_pass http://localhost:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket支持（如果需要）
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## ✅ 验证配置是否成功

### 1. 检查Nginx状态
```bash
# 在1Panel的容器管理中查看nginx容器状态
# 或使用命令：
docker ps | grep nginx
```

### 2. 测试API接口
```bash
# 测试后端健康检查
curl https://your-domain.com/api/v1/healthz

# 预期响应：
# {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}
```

### 3. 测试前端API调用
1. 打开你的网站：`https://your-domain.com`
2. 按F12打开开发者工具
3. 尝试注册/登录功能
4. 在Network标签页查看API请求是否成功

## 🚨 常见问题解决

### 问题1：502 Bad Gateway
**原因**：后端容器未启动或端口错误
```bash
# 检查后端容器状态
docker ps | grep todo-backend

# 检查容器日志
docker logs todo-backend

# 检查端口是否正确
netstat -tlnp | grep 8000
```

### 问题2：404 Not Found
**原因**：代理路径配置错误
- 检查是否填写了 `/api/`（注意最后的斜杠）
- 确认目标地址是 `http://localhost:8000`

### 问题3：CORS错误
**原因**：后端CORS配置问题
检查后端环境变量：
```bash
# 确保CORS_ORIGINS包含你的域名
CORS_ORIGINS=["https://your-domain.com"]
```

## 🎉 配置成功的标志

当配置成功后，你会看到：

1. **网站正常访问**：`https://your-domain.com`
2. **API接口响应**：`https://your-domain.com/api/v1/healthz`
3. **前端功能正常**：可以注册、登录、管理Todo
4. **实时同步工作**：多个设备间数据同步

## 📞 如果还有问题

如果反向代理配置仍然有问题：

1. **查看1Panel日志**：在1Panel的日志管理中查看Nginx错误日志
2. **检查容器网络**：确认nginx和backend容器在同一网络中
3. **重启服务**：尝试重启nginx和backend容器
4. **简化测试**：先用简单接口测试，如健康检查接口

---

**记住**：反向代理的关键是让前端能够通过 `/api/` 路径访问到后端服务！
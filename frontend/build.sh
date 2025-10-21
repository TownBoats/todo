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

# 显示构建大小
echo -e "\nBuild sizes:"
du -sh dist/*

# 验证关键文件
echo -e "\nVerifying critical files..."
if [ -f "dist/index.html" ]; then
    echo "✅ index.html found"
else
    echo "❌ index.html missing"
    exit 1
fi

if [ -f "dist/assets/index"*.js ]; then
    echo "✅ Main JavaScript bundle found"
else
    echo "❌ Main JavaScript bundle missing"
    exit 1
fi

if [ -f "dist/assets/index"*.css ]; then
    echo "✅ Main CSS bundle found"
else
    echo "❌ Main CSS bundle missing"
    exit 1
fi

echo -e "\n🎉 Build verification completed successfully!"
echo "The dist/ folder is ready for deployment to 1Panel."
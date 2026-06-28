#!/bin/bash
# 將 student-ui 同步到 docs（GitHub Pages 用）
set -e
cd "$(dirname "$0")/.."
rm -rf docs
cp -R student-ui docs
echo "✓ docs/ 已從 student-ui/ 同步完成"

#!/bin/bash
# 互動式建立 backend/.dev.vars（機密檔，不會上傳 GitHub）
set -e
cd "$(dirname "$0")"

echo "=== 高手揪派 · Notion 設定 ==="
echo ""
echo "請先準備好："
echo "  1. Notion Token（Line預約API 的 secret_...）"
echo "  2. 三個 Database ID（學員 / 課程 / 預約紀錄）"
echo ""

read -r -p "NOTION_TOKEN: " NOTION_TOKEN
read -r -p "學員表 Database ID（學員預約管理表）: " MEMBERS_ID
read -r -p "課程表 Database ID（2026年7月課表）: " COURSES_ID
read -r -p "預約紀錄表 Database ID: " BOOKINGS_ID

cat > .dev.vars <<EOF
NOTION_TOKEN=${NOTION_TOKEN}
NOTION_DATABASE_MEMBERS=${MEMBERS_ID}
NOTION_DATABASE_COURSES=${COURSES_ID}
NOTION_DATABASE_BOOKINGS=${BOOKINGS_ID}
EOF

echo ""
echo "✓ 已寫入 backend/.dev.vars"
echo "  接下來執行：npx wrangler deploy"

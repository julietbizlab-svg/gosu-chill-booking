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
read -r -p "學員表 Database ID（學員資料）: " MEMBERS_ID
read -r -p "課程表 Database ID（2026年7月課表）: " COURSES_ID
read -r -p "預約紀錄表 Database ID: " BOOKINGS_ID
read -r -p "老師 LINE userId 白名單（可留空，逗號分隔）: " TEACHER_IDS
read -r -p "管理員 LINE userId（可留空，逗號分隔）: " ADMIN_IDS

# 去除前後空白
NOTION_TOKEN=$(echo "$NOTION_TOKEN" | tr -d '[:space:]')
MEMBERS_ID=$(echo "$MEMBERS_ID" | tr -d '[:space:]')
COURSES_ID=$(echo "$COURSES_ID" | tr -d '[:space:]')
BOOKINGS_ID=$(echo "$BOOKINGS_ID" | tr -d '[:space:]')
TEACHER_IDS=$(echo "$TEACHER_IDS" | tr -d '[:space:]')
ADMIN_IDS=$(echo "$ADMIN_IDS" | tr -d '[:space:]')

cat > .dev.vars <<EOF
NOTION_TOKEN=${NOTION_TOKEN}
NOTION_DATABASE_MEMBERS=${MEMBERS_ID}
NOTION_DATABASE_COURSES=${COURSES_ID}
NOTION_DATABASE_BOOKINGS=${BOOKINGS_ID}
TEACHER_LINE_USER_IDS=${TEACHER_IDS}
ADMIN_LINE_USER_IDS=${ADMIN_IDS}
EOF

echo ""
echo "✓ 已寫入 backend/.dev.vars"
echo "  接下來執行：npx wrangler deploy"

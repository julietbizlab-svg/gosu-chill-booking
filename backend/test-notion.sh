#!/bin/bash
# 測試 Notion Token 與 Database ID 是否正確（不會顯示 Token）
set -e
cd "$(dirname "$0")"

if [ ! -f .dev.vars ]; then
  echo "❌ 找不到 .dev.vars，請先執行 ./setup-dev-vars.sh"
  exit 1
fi

# 讀取 .dev.vars（略過註解行）
export $(grep -v '^#' .dev.vars | grep -v '^$' | xargs)

TOKEN_LEN=${#NOTION_TOKEN}
echo "=== Notion 連線測試 ==="
echo "Token 長度: ${TOKEN_LEN} 字元"
echo "Token 開頭: ${NOTION_TOKEN:0:10}..."

if [[ ! "$NOTION_TOKEN" =~ ^(secret_|ntn_) ]]; then
  echo "❌ Token 格式不對！應以 secret_ 或 ntn_ 開頭"
  echo "   請到 Notion → Line預約API → 設定 → 按眼睛顯示 → 按複製"
  exit 1
fi

echo ""
echo "測試學員資料庫..."
RESULT=$(curl -sS -o /tmp/notion-test.json -w "%{http_code}" \
  -H "Authorization: Bearer ${NOTION_TOKEN}" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/${NOTION_DATABASE_MEMBERS}")

if [ "$RESULT" = "200" ]; then
  echo "✅ 學員資料庫連線成功"
else
  echo "❌ 學員資料庫失敗（HTTP $RESULT）"
  cat /tmp/notion-test.json
  echo ""
fi

echo ""
echo "測試課程資料庫..."
RESULT=$(curl -sS -o /tmp/notion-test.json -w "%{http_code}" \
  -H "Authorization: Bearer ${NOTION_TOKEN}" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/${NOTION_DATABASE_COURSES}")

if [ "$RESULT" = "200" ]; then
  echo "✅ 課程資料庫連線成功"
else
  echo "❌ 課程資料庫失敗（HTTP $RESULT）"
  cat /tmp/notion-test.json
fi

#!/bin/zsh
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo '请先安装 Node.js 22.18 或更新版本。'
  read -k 1
  exit 1
fi
if [ ! -f .env.local ]; then
  echo '缺少本机 .env.local。请按照 README 配置 KIE_API_KEY。'
  read -k 1
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
npm start

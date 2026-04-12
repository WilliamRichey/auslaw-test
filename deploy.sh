#!/bin/bash
set -e

SERVER="root@170.64.147.73"

# Commit and push
echo "==> Committing and pushing..."
cd "$(dirname "$0")"
git add -A
git commit -m "${1:-Update}" || echo "Nothing to commit"
git push

# Deploy on server
echo "==> Deploying to $SERVER..."
ssh -o StrictHostKeyChecking=no $SERVER 'bash -s' << 'REMOTE'
cd /var/www/auslaw-test
git pull
npm install
NODE_OPTIONS="--max-old-space-size=384" npx next build
pm2 restart auslaw-test
echo "==> Deploy complete"
REMOTE

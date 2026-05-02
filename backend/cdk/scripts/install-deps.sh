#!/bin/bash
set -e

echo "--- Installing Node.js ---"
dnf install -y nodejs npm

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

echo "--- Setting up Node.js project ---"
mkdir -p /tmp/processor
cd /tmp/processor

cat > package.json << 'EOF'
{
  "name": "file-processor",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
EOF

echo "--- Installing dependencies ---"
npm install

echo "--- Dependencies installed successfully ---"
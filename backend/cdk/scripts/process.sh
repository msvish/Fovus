#!/bin/bash
set -e

exec > >(tee /var/log/process-script.log)
exec 2>&1

echo "----------------------------"
echo "Start of File processing pipeline"
echo "----------------------------"
echo "Timestamp: $(date)"
echo "Arguments received: $@"
echo ""

ID=$1
BUCKET_NAME=$2
REGION=$3
TABLE_NAME=$4

# Fix: Add spaces inside [ ] brackets
if [ -z "$ID" ] || [ -z "$BUCKET_NAME" ] || [ -z "$REGION" ] || [ -z "$TABLE_NAME" ]; then 
    echo "Error: Missing required parameters"
    echo "Usage: process.sh <id> <bucket_name> <region> <table_name>"
    exit 1
fi

echo "--- Downloading Scripts from S3 ---"
# Fix: Remove spaces around = in variable assignment
SCRIPT_DIR="/tmp/scripts"
mkdir -p "$SCRIPT_DIR"

aws s3 cp "s3://${BUCKET_NAME}/scripts/install-deps.sh" "$SCRIPT_DIR/" || {
    echo "Error: Failed to download install-deps.sh"
    exit 1
}

aws s3 cp "s3://${BUCKET_NAME}/scripts/processor.js" "$SCRIPT_DIR/" || {
    echo "Error: Failed to download processor.js"
    exit 1
}

aws s3 cp "s3://${BUCKET_NAME}/scripts/terminate.sh" "$SCRIPT_DIR/" || {
    echo "Error: Failed to download terminate.sh"
    exit 1
}

# Fix: Remove space before .sh in the pattern
chmod +x "$SCRIPT_DIR"/*.sh
echo "Scripts downloaded successfully"
echo ""

bash "$SCRIPT_DIR/install-deps.sh" || {
    echo "Error: Dependency installation failed"
    exit 1
}

# Fix typo: exho -> echo
echo "--- Running File Processor ---"
cd /tmp/processor
cp "$SCRIPT_DIR/processor.js" /tmp/processor/
node processor.js "$ID" "$BUCKET_NAME" "$REGION" "$TABLE_NAME" || {
    echo "Error: File processing failed"
    exit 1
}

bash "$SCRIPT_DIR/terminate.sh" "$REGION" || {
    echo "Warning: Instance termination failed"
    exit 1
}

echo "----------------------------"
echo "Pipeline Completed Successfully"
echo "----------------------------"
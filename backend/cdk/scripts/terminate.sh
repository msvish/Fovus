#!/bin/bash

set -e

echo "---- Initiating Instance Termination ----"

# Get IMDSv2 token
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null)

# Get instance ID using the token
INSTANCE_ID=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  "http://169.254.169.254/latest/meta-data/instance-id" 2>/dev/null)

# Check if instance ID was retrieved
if [ -z "$INSTANCE_ID" ]; then
  echo "Error: Could not retrieve instance ID"
  exit 1
fi

echo "Instance ID: $INSTANCE_ID"
echo "REGION: $1"

# Terminate the instance
aws ec2 terminate-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$1"

echo "---- Termination successful ----"
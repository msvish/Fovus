## Setup Instructions

### 1. Configure AWS Credentials

```bash
aws configure
```

Enter your:

- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Default output format: `json`

Verify credentials:

```bash
aws sts get-caller-identity
```

### 2. Deploy Backend Infrastructure

```bash
cd backend/cdk
npm install

cd backend/cdk/lambda/stream-handler
npm install

cd backend/cdk/lambda/upload-handler
npm install

cdk bootstrap
cdk deploy
```

When prompted "Do you wish to deploy these changes?", type `y` and press Enter.

**Note the outputs** after deployment:

- `ApiUrl` - API Gateway endpoint
- `BucketName` - S3 bucket name
- `TableName` - DynamoDB table name

### 3. Configure Frontend

```bash
cd ../../frontend
npm install
```

Create `.env` file in the `frontend` directory:

```bash
VITE_API_URL = API_URL
```

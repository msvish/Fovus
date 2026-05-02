import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";

export class FileProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========== S3 Bucket ==========
    const fileProcessingBucket = new s3.Bucket(this, "FileProcessingBucket", {
      bucketName: `file-processing-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    // Upload processing scripts to S3
    new s3deploy.BucketDeployment(this, "DeployScripts", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "..", "scripts"))],
      destinationBucket: fileProcessingBucket,
      destinationKeyPrefix: "scripts/",
    });

    // ========== DynamoDB Table ==========
    const fileTable = new dynamodb.Table(this, "FileTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // ========== VPC ==========
    const vpc = new ec2.Vpc(this, "FileProcessingVpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ========== Security Group for EC2 ==========
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "EC2SecurityGroup", {
      vpc,
      description: "Security group for file processing EC2 instances",
      allowAllOutbound: true,
    });

    // ========== IAM Role for EC2 ==========
    const ec2Role = new iam.Role(this, "EC2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });

    fileProcessingBucket.grantReadWrite(ec2Role);
    fileTable.grantReadWriteData(ec2Role);

    // Allow EC2 to terminate itself
    ec2Role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:TerminateInstances"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ec2:ResourceTag/Purpose": "FileProcessing",
          },
        },
      }),
    );

    // Create instance profile
    const instanceProfile = new iam.CfnInstanceProfile(
      this,
      "EC2InstanceProfile",
      {
        roles: [ec2Role.roleName],
        instanceProfileName: "FileProcessingInstanceProfile",
      },
    );

    // ========== Upload Handler Lambda ==========
    const uploadHandlerLambda = new lambdaNodejs.NodejsFunction(
      this,
      "UploadHandlerLambda",
      {
        functionName: "upload-handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(
          __dirname,
          "..",
          "lambda",
          "upload-handler",
          "index.ts",
        ),
        handler: "handler",
        environment: {
          BUCKET_NAME: fileProcessingBucket.bucketName,
          TABLE_NAME: fileTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
      },
    );

    fileProcessingBucket.grantPut(uploadHandlerLambda);
    fileTable.grantWriteData(uploadHandlerLambda);

    // ========== Stream Handler Lambda ==========
    const streamHandlerLambda = new lambdaNodejs.NodejsFunction(
      this,
      "StreamHandlerLambda",
      {
        functionName: "stream-handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(
          __dirname,
          "..",
          "lambda",
          "stream-handler",
          "index.ts",
        ),
        handler: "handler",
        environment: {
          BUCKET_NAME: fileProcessingBucket.bucketName,
          TABLE_NAME: fileTable.tableName,
          SUBNET_ID: vpc.privateSubnets[0].subnetId,
          SECURITY_GROUP_ID: ec2SecurityGroup.securityGroupId,
          INSTANCE_ROLE_NAME: instanceProfile.instanceProfileName!,
        },
        timeout: cdk.Duration.seconds(60),
      },
    );

    // Grant permissions to launch EC2
    streamHandlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:RunInstances",
          "ec2:CreateTags",
          "ec2:DescribeInstances",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
        ],
        resources: ["*"],
      }),
    );

    // Grant permission to get AMI from SSM Parameter Store
    streamHandlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:*:parameter/aws/service/ami-amazon-linux-latest/*`,
        ],
      }),
    );

    streamHandlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [ec2Role.roleArn],
      }),
    );

    fileTable.grantStreamRead(streamHandlerLambda);

    // Add DynamoDB Stream as event source
    streamHandlerLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(fileTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1,
        retryAttempts: 2,
      }),
    );

    // ========== API Gateway ==========
    const api = new apigateway.RestApi(this, "FileProcessingApi", {
      restApiName: "file-processing-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const uploadResource = api.root.addResource("upload");
    uploadResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(uploadHandlerLambda),
    );

    // ========== Outputs ==========
    new cdk.CfnOutput(this, "BucketName", {
      value: fileProcessingBucket.bucketName,
      description: "S3 Bucket Name",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: fileTable.tableName,
      description: "DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });
  }
}

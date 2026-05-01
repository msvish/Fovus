import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import path from "path";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class FileProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fileProcessingBucket = new s3.Bucket(this, "FileProcessingBucket", {
      bucketName: `file-processing-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    const fileTable = new dynamodb.Table(this, "Table", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const uploadHandlerLambda = new lambdaNodejs.NodejsFunction(
      this,
      "UploadHandlerLambda",
      {
        functionName: "upload-Handler",
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

    fileProcessingBucket.grantPut(uploadHandlerLambda);
    fileTable.grantWriteData(uploadHandlerLambda);

    new cdk.CfnOutput(this, "BucketName", {
      value: fileProcessingBucket.bucketName,
      description: "s3 Bucket Name",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: fileTable.tableName,
      description: "DynamoDB table Name",
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });
  }
}

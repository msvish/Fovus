#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { FileProcessingStack } from "../lib/file-processing-stack";

const app = new cdk.App();
new FileProcessingStack(app, "FileProcessingStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

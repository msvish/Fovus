import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ec2Client = new EC2Client({});
const ssmClient = new SSMClient({});

const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;
const SCRIPT_KEY = "scripts/process.sh";
const SUBNET_ID = process.env.SUBNET_ID!;
const SECURITY_GROUP_ID = process.env.SECURITY_GROUP_ID!;
const INSTANCE_ROLE_NAME = process.env.INSTANCE_ROLE_NAME!;

// Get latest Amazon Linux 2023 AMI ID from SSM Parameter Store
async function getLatestAmiId(): Promise<string> {
  try {
    const command = new GetParameterCommand({
      Name: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
    });
    const response = await ssmClient.send(command);
    return response.Parameter?.Value || "ami-0453ec754f44f9a4a"; // fallback
  } catch (error) {
    console.error("Error fetching AMI ID from SSM, using fallback:", error);
    return "ami-0453ec754f44f9a4a"; // fallback AMI
  }
}

export const handler = async (event: any) => {
  try {
    for (const record of event.Records) {
      if (record.eventName === "INSERT") {
        const newImage = record.dynamodb.NewImage;
        const id = newImage.id.S;

        console.log(`Processing new record with ID: ${id}`);

        // Get latest AMI ID
        const amiId = await getLatestAmiId();
        console.log(`Using AMI: ${amiId}`);

        // Create user data script that will run on EC2 startup
        const userData = Buffer.from(
          `#!/bin/bash
set -e
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "=== Downloading main orchestrator script ==="
aws s3 cp s3://${BUCKET_NAME}/${SCRIPT_KEY} /tmp/process.sh
chmod +x /tmp/process.sh

echo "=== Starting file processing pipeline ==="
/tmp/process.sh "${id}" "${BUCKET_NAME}" "${process.env.AWS_REGION}" "${TABLE_NAME}"
`,
        ).toString("base64");

        // Launch EC2 instance
        const runCommand = new RunInstancesCommand({
          ImageId: amiId,
          InstanceType: "t2.micro",
          MinCount: 1,
          MaxCount: 1,
          SubnetId: SUBNET_ID,
          SecurityGroupIds: [SECURITY_GROUP_ID],
          IamInstanceProfile: {
            Name: INSTANCE_ROLE_NAME,
          },
          UserData: userData,
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                { Key: "Name", Value: `file-processor-${id}` },
                { Key: "Purpose", Value: "FileProcessing" },
              ],
            },
          ],
        });

        const response = await ec2Client.send(runCommand);
        console.log(
          `EC2 instance launched: ${response.Instances?.[0].InstanceId}`,
        );
      }
    }

    return { statusCode: 200, body: "Processing complete" };
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

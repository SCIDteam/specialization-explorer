import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as fc from "fast-check";
import { KnowledgeBaseStack } from "../lib/knowledge-base-stack";

/**
 * Parameters for synthesizing a KnowledgeBaseStack in tests.
 */
export interface TestVpcInputs {
  vpcId: string;
  subnetIds: string[];
  availabilityZones: string[];
  vpcCidr: string;
}

/**
 * Synthesizes a KnowledgeBaseStack with the given VPC inputs and returns
 * the CloudFormation Template for assertions.
 *
 * This helper creates:
 * - A CDK App with a mock VPC (via Vpc.fromVpcAttributes)
 * - A mock ECR repository (via Repository.fromRepositoryName)
 * - A KnowledgeBaseStack instance with all required props
 *
 * Reusable by all property-based tests in this file.
 */
export function synthesizeKBStack(inputs: TestVpcInputs): Template {
  const app = new cdk.App();

  const stack = new cdk.Stack(app, "TestSupportStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });

  const vpc = ec2.Vpc.fromVpcAttributes(stack, "MockVpc", {
    vpcId: inputs.vpcId,
    availabilityZones: inputs.availabilityZones,
    privateSubnetIds: inputs.subnetIds,
  });

  const mockRepo = ecr.Repository.fromRepositoryName(
    stack,
    "MockEcrRepo",
    "mock-vector-index-manager"
  );

  const kbStack = new KnowledgeBaseStack(app, "TestKBStack", {
    env: { account: "123456789012", region: "us-east-1" },
    stackPrefix: "Test",
    vectorIndexManagerRepository: mockRepo,
    vectorIndexManagerPipelineName: "mock-pipeline",
    vpc,
    vpcCidr: inputs.vpcCidr,
  });

  return Template.fromStack(kbStack);
}

describe("Knowledge Base VPC test helper", () => {
  it("should synthesize a valid template with default inputs", () => {
    const template = synthesizeKBStack({
      vpcId: "vpc-12345",
      subnetIds: ["subnet-aaa", "subnet-bbb"],
      availabilityZones: ["us-east-1a", "us-east-1b"],
      vpcCidr: "10.0.0.0/16",
    });

    // Verify the template contains the expected VPC endpoint resource
    template.hasResourceProperties(
      "AWS::OpenSearchServerless::VpcEndpoint",
      {
        VpcId: "vpc-12345",
      }
    );
  });
});

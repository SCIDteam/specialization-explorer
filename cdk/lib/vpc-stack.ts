import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Fn } from "aws-cdk-lib";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

export class VpcStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly vpcCidrString: string;
  public readonly privateSubnetsCidrStrings: string[];

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { stackPrefix: string }
  ) {
    super(scope, id, props);

    /* * DEPLOYMENT_CHANGE_1: Hardcoded target VPC ID.
     * Originally left blank (""), skipping custom networking blocks and forcing 
     * clean VPC creation. Populating this routes execution into the lookup architecture.
     */
    const existingVpcId: string = "vpc-0c71ea24e02b20a87"; // CHANGE IF DEPLOYING WITH EXISTING VPC

    if (existingVpcId !== "") {
      const AWSControlTowerStackSet = "prd-scid-devapps-prd-vpc"; // CHANGE TO YOUR CONTROL TOWER STACK SET
      const existingPublicSubnetID: string = ""; // CHANGE IF DEPLOYING WITH EXISTING PUBLIC SUBNET

      const latPrefix = props.stackPrefix;

      const publicSubnetCidr = "172.31.0.0/20"; // CHANGE TO YOUR PUBLIC SUBNET CIDR; IT MUST NOT OVERLAP WITH PRIVATE SUBNETS
      this.vpcCidrString = "10.0.0.0/8"; // CHANGE TO YOUR VPC CIDR; IT MUST ENCOMPASS ALL SUBNET CIDRS
      
      /* * DEPLOYMENT_CHANGE_2: Direct Main Route Table Constant Mapping.
       * Imported VPC resources do not expose sub-properties like '.routeTable' natively in CDK.
       * Hardcoding this variable prevents TypeError undefined crashes during local synthesis.
       */
      const rawRouteTableId = "rtb-0ac1036af06fc5e15";

      // VPC for application
      /* * DEPLOYMENT_CHANGE_3: Refactored ec2.Vpc.fromVpcAttributes.
       * Bypassed all dynamic 'Fn.importValue' hooks because the corporate network stack 
       * does not expose globally unique Export Names. Swapped out 3 AZ mappings down to 
       * 2 AZs (ca-central-1a / ca-central-1b) to mirror corporate network architecture layout bounds.
       */
      this.vpc = ec2.Vpc.fromVpcAttributes(this, `${id}-Vpc`, {
        vpcId: 'vpc-0c71ea24e02b20a87',
        availabilityZones: ['ca-central-1a', 'ca-central-1b'],
        privateSubnetIds: [
          'subnet-0f84a5f17325314a4', // prd-prd-scid-devapps-prd-vpc-back-ca-central-1a
          'subnet-0b6829a0a24226c53'  // prd-prd-scid-devapps-prd-vpc-back-ca-central-1b
        ],
        privateSubnetRouteTableIds: [
          rawRouteTableId,
          rawRouteTableId
        ],
        isolatedSubnetIds: [
          'subnet-0f84a5f17325314a4',
          'subnet-0b6829a0a24226c53'
        ],
        isolatedSubnetRouteTableIds: [
          rawRouteTableId,
          rawRouteTableId
        ],
       // Updated to match your corporate network's internal IP block
        vpcCidrBlock: '10.0.0.0/8'
      }) as ec2.Vpc;

      // Extract CIDR ranges from the private subnets
      /* * DEPLOYMENT_CHANGE_4: Replaced Private Subnet CIDR Import Array.
       * Replaced cross-stack references with direct literal network CIDR string block notation 
       * to keep security group dependencies compiling cleanly without lookups.
       */
      this.privateSubnetsCidrStrings = [
        '10.0.0.0/8',
        '172.31.0.0/16'
      ];

      /* * DEPLOYMENT_CHANGE_5: Deactivated Public Network Infrastructure Generation Blocks.
       * Corporate AWS Organization SCPs explicitly forbid project accounts from provisioning Subnets, 
       * Internet Gateways, Elastic IPs, or changing Route Tables. Commenting out this entire block 
       * prevents 403 access denied errors since internet traffic routing is centrally managed by Transit Gateways.
       */
      console.log("Skipping all public network infrastructure provisioning due to corporate SCP constraints.");
      
      /* if (existingPublicSubnetID === "") {
        console.log(
          "No public subnet exists. Creating new public subnet, IGW, and NAT GW."
        );

        // Create a public subnet
        const publicSubnet = new ec2.Subnet(this, `PublicSubnet`, {
          vpcId: this.vpc.vpcId,
          availabilityZone: this.vpc.availabilityZones[0],
          cidrBlock: publicSubnetCidr,
          mapPublicIpOnLaunch: true,
        });

        // Create an Internet Gateway and attach it to the VPC
        const internetGateway = new ec2.CfnInternetGateway(
          this,
          `InternetGateway`,
          {}
        );
        const vpcGatewayAttachment = new ec2.CfnVPCGatewayAttachment(this, "VPCGatewayAttachment", {
          vpcId: this.vpc.vpcId,
          internetGatewayId: internetGateway.ref,
        });

        // Add a NAT Gateway in the public subnet
        const natGateway = new ec2.CfnNatGateway(this, `NatGateway`, {
          subnetId: publicSubnet.subnetId,
          allocationId: new ec2.CfnEIP(this, "EIP", {}).attrAllocationId,
        });

        // Use the route table associated with the public subnet
        const publicRouteTableId = publicSubnet.routeTable.routeTableId;

        // Add a route to the Internet Gateway in the existing public route table
        const publicRoute = new ec2.CfnRoute(this, `PublicRoute`, {
          routeTableId: publicRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          gatewayId: internetGateway.ref,
        });
        publicRoute.addDependency(vpcGatewayAttachment);

        // NAT Gateway also needs the IGW attached before it can work
        natGateway.addDependency(vpcGatewayAttachment);

        // Update route table for private subnets
        new ec2.CfnRoute(this, `${latPrefix}PrivateSubnetRoute1`, {
          routeTableId: rawRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });

        new ec2.CfnRoute(this, `${latPrefix}PrivateSubnetRoute2`, {
          routeTableId: rawRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });
      } else {
        console.log(
          `Public subnet already exists. Creating NAT GW and private subnet routes.`
        );

        // Reference the existing public subnet
        const existingPublicSubnet = ec2.Subnet.fromSubnetId(
          this,
          "ExistingPublicSubnet",
          existingPublicSubnetID
        );

        // Look up the existing Internet Gateway attached to the VPC
        const igwLookup = new AwsCustomResource(this, "IGWLookup", {
          onCreate: {
            service: "EC2",
            action: "describeInternetGateways",
            parameters: {
              Filters: [
                {
                  Name: "attachment.vpc-id",
                  Values: [existingVpcId],
                },
              ],
            },
            physicalResourceId: PhysicalResourceId.of("igw-lookup"),
          },
          policy: AwsCustomResourcePolicy.fromSdkCalls({
            resources: AwsCustomResourcePolicy.ANY_RESOURCE,
          }),
        });

        const existingIgwId = igwLookup.getResponseField(
          "InternetGateways.0.InternetGatewayId"
        );

        // Add a NAT Gateway in the existing public subnet
        const natGateway = new ec2.CfnNatGateway(this, `NatGateway`, {
          subnetId: existingPublicSubnetID,
          allocationId: new ec2.CfnEIP(this, "EIP", {}).attrAllocationId,
        });

        // Update route table for private subnets to route internet traffic through NAT
        new ec2.CfnRoute(this, `${latPrefix}PrivateSubnetRoute1`, {
          routeTableId: rawRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });

        new ec2.CfnRoute(this, `${latPrefix}PrivateSubnetRoute2`, {
          routeTableId: rawRouteTableId,
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: natGateway.ref,
        });
      }
      */

      /* * DEPLOYMENT_CHANGE_6: Deactivated Local VPC Endpoint Creation.
       * Corporate SCPs block 'ec2:CreateVpcEndpoint'. Interface/Gateway endpoints for 
       * SSM, Secrets Manager, RDS, DynamoDB, and S3 are managed at the central network hub level. 
       * Commenting these out avoids 403 access denied errors.
       */
      console.log("Skipping local VPC endpoint creation due to corporate SCP constraints.");
      
      /*
      // Add interface endpoints for private isolated subnets
      this.vpc.addInterfaceEndpoint("SSM Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        privateDnsEnabled: true,
      });

      this.vpc.addInterfaceEndpoint("Secrets Manager Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        privateDnsEnabled: true,
      });

      this.vpc.addInterfaceEndpoint("RDS Endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        privateDnsEnabled: true,
      });

      this.vpc.addFlowLog(`${id}-vpcFlowLog`);

      // Add DynamoDB gateway endpoint
      this.vpc.addGatewayEndpoint(`${id}-DynamoDB Endpoint`, {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
      });

      // Add S3 gateway endpoint
      this.vpc.addGatewayEndpoint(`${id}-S3 Endpoint`, {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
      });
      */

      // Get default security group for VPC
      const defaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        id,
        this.vpc.vpcDefaultSecurityGroup
      );
    } else {
      this.vpcCidrString = "10.0.0.0/16";

      const natGatewayProvider = ec2.NatProvider.gateway();

      // VPC for application
      this.vpc = new ec2.Vpc(this, "SpecEx-Vpc", {
        ipAddresses: ec2.IpAddresses.cidr(this.vpcCidrString),
        natGatewayProvider: natGatewayProvider,
        natGateways: 1,
        maxAzs: 2,
        subnetConfiguration: [
          {
            name: "public-subnet-1",
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            name: "private-subnet-1",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
          {
            name: "isolated-subnet-1",
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
      });

      this.vpc.addFlowLog("specEx-vpcFlowLog");

      // Add secrets manager endpoint to VPC
      this.vpc.addInterfaceEndpoint(`${id}-Secrets Manager Endpoint`, {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });

      // Add RDS endpoint to VPC
      this.vpc.addInterfaceEndpoint(`${id}-RDS Endpoint`, {
        service: ec2.InterfaceVpcEndpointAwsService.RDS,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      });

      // Add DynamoDB gateway endpoint
      this.vpc.addGatewayEndpoint(`${id}-DynamoDB Endpoint`, {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        subnets: [
          { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        ],
      });

      // Add S3 gateway endpoint
      this.vpc.addGatewayEndpoint(`${id}-S3 Endpoint`, {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [
          { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        ],
      });
    }
  }
}
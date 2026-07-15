import { Duration, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface PreviewPrStackProps extends StackProps {
  mainStackName: string;
  prNumber: number;
  imageUri: string;
  runtimeRoleArn: string;
  previewZone: string;
}

/**
 * 每个 PR 的临时预览栈（等价于原 infra/pr-preview-env.yaml，改写为 CDK L2 构造）：
 * 私有子网 Fargate（go-api + 一次性 postgres 边车），经每 PR 目标组 + Host 监听规则
 * 挂到共享预览 ALB（api-pr-<n>.<zone>）。网络/ALB/角色都从主栈与平台栈的导出引入。
 */
export class PreviewPrStack extends Stack {
  constructor(scope: Construct, id: string, props: PreviewPrStackProps) {
    super(scope, id, props);

    const { mainStackName, prNumber, imageUri, runtimeRoleArn, previewZone } = props;
    const name = `${mainStackName}-pr-${prNumber}`;
    const imp = (exportName: string): string => Fn.importValue(`${mainStackName}-${exportName}`);

    const privateSubnetIds = [imp("PrivateSubnet1"), imp("PrivateSubnet2")];
    const vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: imp("VpcId"),
      // 两个私有子网各占一个 AZ；子网数须是 AZ 数的整数倍，故取前 2 个 AZ
      availabilityZones: this.availabilityZones.slice(0, privateSubnetIds.length),
      privateSubnetIds,
    });
    const subnets = privateSubnetIds.map((sid, i) => ec2.Subnet.fromSubnetId(this, `PrivateSubnet${i + 1}`, sid));
    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, "AlbSg", imp("PreviewAlbSecurityGroup"));

    // 任务安全组：只放行来自共享预览 ALB 的 8080
    const taskSg = new ec2.SecurityGroup(this, "TaskSg", { vpc, allowAllOutbound: true });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(8080), "from shared preview ALB");

    const logGroup = new logs.LogGroup(this, "Log", {
      logGroupName: `/ecs/${name}`,
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, clusterName: name });

    // 预览任务复用平台栈的 Runtime 角色（执行 + 任务角色）
    const runtimeRole = iam.Role.fromRoleArn(this, "RuntimeRole", runtimeRoleArn, { mutable: false });

    const task = new ecs.FargateTaskDefinition(this, "Task", {
      family: name,
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      executionRole: runtimeRole,
      taskRole: runtimeRole,
    });

    // 一次性 Postgres：随任务生死，PR 环境彼此隔离、绝不碰生产库
    const postgres = task.addContainer("postgres", {
      image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/postgres:16-alpine"),
      essential: true,
      environment: { POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres", POSTGRES_DB: "appdb" },
      portMappings: [{ containerPort: 5432 }],
      healthCheck: {
        command: ["CMD-SHELL", "pg_isready -U postgres -d appdb"],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5),
        retries: 5,
        startPeriod: Duration.seconds(20),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "postgres", logGroup }),
    });

    const goApi = task.addContainer("go-api", {
      image: ecs.ContainerImage.fromRegistry(imageUri),
      essential: true,
      environment: {
        PORT: "8080",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/appdb?sslmode=disable",
      },
      portMappings: [{ containerPort: 8080 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "go-api", logGroup }),
    });
    // 等 Postgres 健康再启动，冷启动 ensureSchema 才能建表
    goApi.addContainerDependencies({ container: postgres, condition: ecs.ContainerDependencyCondition.HEALTHY });

    // 每 PR 目标组 + Host 监听规则，挂到共享 ALB
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "Tg", {
      targetGroupName: name,
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: Duration.seconds(5),
      healthCheck: {
        path: "/health",
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
      },
    });

    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, "Listener", {
      listenerArn: imp("PreviewAlbListenerArn"),
      securityGroup: albSg,
    });

    const rule = new elbv2.ApplicationListenerRule(this, "Rule", {
      listener,
      // PR 编号天然唯一，直接作优先级（1-50000）
      priority: prNumber,
      conditions: [elbv2.ListenerCondition.hostHeaders([`api-pr-${prNumber}.${previewZone}`])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      serviceName: name,
      taskDefinition: task,
      desiredCount: 1,
      assignPublicIp: false, // 私有子网 + 经主栈 NAT 拉镜像；入口只走共享 ALB
      vpcSubnets: { subnets },
      securityGroups: [taskSg],
      healthCheckGracePeriod: Duration.seconds(60),
    });
    targetGroup.addTarget(service.loadBalancerTarget({ containerName: "go-api", containerPort: 8080 }));
    // 目标组必须先经监听规则挂到 ALB，服务才能注册
    service.node.addDependency(rule);
  }
}

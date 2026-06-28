# aws-infra-sam-deploy — 技术设计

## 设计版本

| 日期       | 版本 | 说明     |
| ---------- | ---- | -------- |
| 2026-06-28 | v1   | 初始设计 |

## 项目架构

- 架构类型: AWS Serverless（SAM `AWS::Serverless-2016-10-31`）+ 自建 VPC，区域 ap-northeast-1
- 涉及层: 网络（VPC/子网/NAT/路由）、安全组、凭据（Secrets Manager）、数据库（Aurora）、计算（Lambda）、网关（HTTP API）、构建（tsdown 打包）
- 文件: `template.yaml`、`samconfig.toml`、`apps/server/tsdown.config.ts`

> 无 `.claude/rules/`；遵循踩坑记录的硬约束：RDS/EC2 的 description 字段不得含中文（非 ASCII 会致整栈回滚），故 `DBSubnetGroupDescription`、安全组 `GroupDescription` 用英文。

## 请求/数据流

```
Internet → API Gateway(HTTP API) → Lambda(私有子网×2, Hono) → Aurora(私有子网×2, 5432)
                                         └→ NAT(公有子网) → api.github.com
```

## 功能模块设计

### 模块 1: 网络（F-001 / F-002）

- `Vpc` 10.0.0.0/16，EnableDnsSupport/Hostnames。`InternetGateway` + `VpcGatewayAttachment`。
- `PublicSubnet` 10.0.0.0/24（`MapPublicIpOnLaunch`，AZ[0]）；`PrivateSubnet1` 10.0.1.0/24（AZ[0]）、`PrivateSubnet2` 10.0.2.0/24（AZ[1]），AZ 用 `!Select [n, !GetAZs ""]`。
- `NatEip`（DependsOn 网关附着）+ `NatGateway`（在公有子网）。
- `PublicRouteTable`（`0.0.0.0/0→IGW`）关联公有子网；`PrivateRouteTable`（`0.0.0.0/0→NAT`）关联两个私有子网。VPC 自带 main route table 空置属正常。

### 模块 2: 安全组（F-003）

- `LambdaSecurityGroup`：`SecurityGroupEgress -1/0.0.0.0/0`（全出网，含 NAT 与 Aurora）。
- `DBSecurityGroup` + 独立 `DBIngressFromLambda`：tcp 5432，`SourceSecurityGroupId = LambdaSecurityGroup`（仅 Lambda 可连库）。GroupDescription 用英文。

### 模块 3: 凭据（F-004）

- `DBSecret`：`GenerateSecretString` 模板 `{"username":"${DBUsername}"}`，生成 24 位 `password`，`ExcludePunctuation`（纯字母数字，可安全拼进 DATABASE_URL）。
- `AuthSecret`：同法生成页面/接口 Basic Auth 密码。description 用英文/可含说明。

### 模块 4: 数据库（F-005）

- `DBSubnetGroup`（2 私有子网，描述英文）。
- `DBCluster` aurora-postgresql，`MasterUserPassword` 用 `{{resolve:secretsmanager:${DBSecret}:SecretString:password}}`，端口 5432，`ServerlessV2ScalingConfiguration` 0.5–2，`DeletionPolicy/UpdateReplacePolicy: Delete`。
- `DBInstance` `db.serverless`。

### 模块 5: Lambda + HTTP API（F-006）

- `Globals.Function`：nodejs22.x、Timeout 30、MemorySize 256、Architectures arm64。
- `ApiFunction`：`CodeUri apps/server/dist/`，`Handler lambda.handler`，`VpcConfig`（Lambda SG + 2 私有子网），`PermissionsBoundary arn:...:policy/${LambdaBoundaryName}`，`Policies: [AWSLambdaVPCAccessExecutionRole]`。
- Env：`NODE_ENV=production`、`CORS_ORIGIN=!Ref CorsOrigin`、`BASIC_AUTH_USER`、`BASIC_AUTH_PASSWORD`（resolve AuthSecret）、`DATABASE_SSL=true`、`DATABASE_URL`（resolve DBSecret 拼 `${DBCluster.Endpoint.Address}`）。
- Events：`Root /` ANY、`Proxy /{proxy+}` ANY（HttpApi）。

### 模块 6: 打包与配置（F-007）

- `tsdown.config.ts` lambda 段：entry `lambda.ts`，platform node，`noExternal: [/.*/]`（全内联），`external: ["pg-native","cloudflare:sockets"]`。产物 `dist/lambda.mjs`，SAM 仅打包 dist。
- `samconfig.toml`：region ap-northeast-1、stack_name、capabilities、parameter_overrides。
- Outputs：`ApiUrl`（`https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com`）、`DBEndpoint`、`AuthSecretArn`。

## 接口契约

CloudFormation Parameters：`CorsOrigin`(默认 `*`)、`DBName`(appdb)、`DBUsername`(app_admin)、`BasicAuthUser`(admin)、`LambdaBoundaryName`。Outputs 见模块 6。

## 数据模型

基础设施资源拓扑（VPC/子网/SG/Secrets/Aurora/Lambda/HttpApi）如上；应用表结构见 1.github-data-core。

## 安全考虑

- Aurora 仅私有子网，SG 只放行来自 Lambda 的 5432，无公网入口。
- 所有密码 Secrets Manager 生成 + `{{resolve}}` 注入，不落仓库。
- Lambda 角色挂权限边界（由 bootstrap 预建），实际权限被封顶。
- `CORS_ORIGIN` 走 union 校验（`*` 或 URL），避免冷启动 env 校验抛错（踩坑记录 2）。

## 技术决策

| 决策 | 选项 | 理由 |
| ---- | ---- | ---- |
| 单公有子网放 NAT | 1 出网 + 2 私有 | 满足作业「1 子网出网，2 子网部署」 |
| Aurora Serverless v2 | 0.5–2 ACU | 按需伸缩、成本低 |
| DeletionPolicy Delete | 不留快照 | 验收后一键拆栈省钱 |
| 自包含 tsdown 打包 | 全依赖内联 | Lambda 无需装 node_modules，CodeUri 只含 dist |
| arm64 | Graviton | 更低单价 |
| description 全英文 | 避免中文 | 非 ASCII 致 CloudFormation 回滚（踩坑记录 1） |

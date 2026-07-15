#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { PreviewPrStack } from "../lib/preview-pr-stack";

const app = new cdk.App();

// context（-c key=value）优先，其次同名大写环境变量
function ctx(key: string, fallback?: string): string | undefined {
  return (app.node.tryGetContext(key) as string | undefined) ?? process.env[key.toUpperCase()] ?? fallback;
}

const mainStackName = ctx("mainStackName", "github-repositories-fllow")!;
const prNumber = Number(ctx("prNumber"));
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  throw new Error("prNumber 必填且为正整数（-c prNumber=222）");
}
// destroy 时无需真实镜像/角色，用占位即可（cdk destroy 只按栈名删除）
const imageUri = ctx("imageUri", "placeholder-image")!;
const runtimeRoleArn = ctx("runtimeRoleArn", "arn:aws:iam::000000000000:role/placeholder")!;
const previewZone = ctx("previewZone", "faithcal.xyz")!;

new PreviewPrStack(app, `${mainStackName}-pr-${prNumber}`, {
  // 用 CLI 凭据（GitHub Actions 假设的 Ops 角色）直接部署，免 cdk bootstrap、不假设宽权限的 CDK 角色
  synthesizer: new cdk.CliCredentialsStackSynthesizer(),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  mainStackName,
  prNumber,
  imageUri,
  runtimeRoleArn,
  previewZone,
});

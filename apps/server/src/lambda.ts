import { handle } from "hono/aws-lambda";

import { app } from "./app";

/** API Gateway (HTTP API / payload v2) -> Hono 的 Lambda 入口。 */
export const handler = handle(app);

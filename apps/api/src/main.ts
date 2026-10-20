import "./load-env.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind the Fly proxy, req.ip must come from X-Forwarded-For.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(cookieParser());
  const origins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(process.env.API_PORT ?? 4000);
}
await bootstrap();

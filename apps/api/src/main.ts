import "./load-env.js";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind the Fly proxy, req.ip must come from X-Forwarded-For.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.enableShutdownHooks();
  // Range and already-encoded responses (media bytes) pass through untouched.
  app.use(
    compression({
      filter: (req, res) =>
        !req.headers.range &&
        !res.getHeader("Accept-Ranges") &&
        compression.filter(req, res),
    }),
  );
  app.use(cookieParser());
  const origins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    maxAge: 86400,
  });
  await app.listen(process.env.API_PORT ?? 4000);
}
await bootstrap();

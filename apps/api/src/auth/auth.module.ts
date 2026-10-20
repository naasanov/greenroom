import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

// Magic-link requests are limited per IP and per target email.
const throttlers = [
  {
    name: "ip",
    ttl: 60_000,
    limit: 20,
    getTracker: (req: Record<string, unknown>) =>
      String((req as unknown as Request).ip),
  },
  {
    name: "email",
    ttl: 15 * 60_000,
    limit: 5,
    getTracker: (req: Record<string, unknown>) =>
      String((req as unknown as Request).body?.email ?? "").toLowerCase(),
  },
];

@Global()
@Module({
  imports: [ThrottlerModule.forRoot({ throttlers })],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}

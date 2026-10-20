import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { User } from "@greenroom/shared";
import { IS_PUBLIC_KEY, sessionCookieName } from "./auth.constants.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: User }>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      sessionCookieName()
    ];
    const user = token ? await this.sessions.resolve(token) : null;
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

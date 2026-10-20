import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { User } from "@greenroom/shared";
import { IS_PUBLIC_KEY } from "./auth.constants.js";

/** Opts a controller or route out of the global auth guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the authenticated user (set by AuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<{ user: User }>().user,
);

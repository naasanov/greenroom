import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Request } from "express";
import { memberships, type Database } from "@greenroom/db";
import type { BandRole, User } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";

/** The caller's active membership in the band named by `:bandId`. */
export interface BandMembership {
  id: string;
  bandId: string;
  userId: string;
  role: BandRole;
}

type BandRequest = Request & { user: User; membership?: BandMembership };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BandMemberGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) protected readonly db: Database) {}

  protected readonly requireAdmin: boolean = false;

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<BandRequest>();
    const bandId = req.params["bandId"];
    if (typeof bandId !== "string" || !UUID_RE.test(bandId)) {
      throw new NotFoundException("Band not found");
    }
    const [row] = await this.db
      .select({
        id: memberships.id,
        bandId: memberships.bandId,
        userId: memberships.userId,
        role: memberships.role,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, req.user.id),
          isNull(memberships.leftAt),
        ),
      );
    if (!row) throw new NotFoundException("Band not found");
    if (this.requireAdmin && row.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    req.membership = row;
    return true;
  }
}

@Injectable()
export class BandAdminGuard extends BandMemberGuard {
  protected override readonly requireAdmin = true;
}

/** Requires an active membership in `:bandId` (404 otherwise). */
export const BandMember = () => applyDecorators(UseGuards(BandMemberGuard));

/** Requires an admin membership in `:bandId` (404 non-member, 403 member). */
export const BandAdmin = () => applyDecorators(UseGuards(BandAdminGuard));

/** Injects the membership resolved by @BandMember() or @BandAdmin(). */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BandMembership =>
    ctx.switchToHttp().getRequest<BandRequest>().membership!,
);

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, memberships, type Database } from "@greenroom/db";
import {
  FEEDBACK_ERROR_CODES,
  type FeedbackInput,
  type FeedbackResult,
  type User,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  GITHUB,
  GithubNotConfiguredError,
  type GithubAdapter,
} from "../integrations/github/github.adapter.js";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const TITLE_MAX = 80;

/** Single-line title from the message when none was given. */
export function deriveTitle(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  const text =
    line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 3)}...` : line;
  return `Feedback: ${text}`;
}

/** Turns member feedback into labelled GitHub issues, rate limited per user. */
@Injectable()
export class FeedbackService {
  private readonly log = new Logger(FeedbackService.name);
  private readonly sent = new Map<string, number[]>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GITHUB) private readonly github: GithubAdapter,
  ) {}

  /** Records an attempt for the user or throws 429 past the hourly cap. */
  private checkRate(userId: string): void {
    const now = Date.now();
    const recent = (this.sent.get(userId) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    if (recent.length >= MAX_PER_WINDOW) {
      this.sent.set(userId, recent);
      throw new HttpException(
        {
          code: FEEDBACK_ERROR_CODES.rateLimited,
          message: "Too much feedback sent recently. Please try again later.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.sent.set(userId, recent);
  }

  private async bandName(userId: string, bandId?: string) {
    if (!bandId) return null;
    const [row] = await this.db
      .select({ name: bands.name })
      .from(memberships)
      .innerJoin(bands, eq(bands.id, memberships.bandId))
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    return row?.name ?? null;
  }

  async submit(user: User, input: FeedbackInput): Promise<FeedbackResult> {
    this.checkRate(user.id);
    const band = await this.bandName(user.id, input.bandId);
    const body = [
      input.message,
      "",
      "---",
      `Reporter: ${user.displayName} (${user.email})`,
      `Band: ${band ?? "none"}`,
      `Page: ${input.pageUrl ?? "unknown"}`,
      `User agent: ${input.userAgent ?? "unknown"}`,
    ].join("\n");
    try {
      await this.github.createIssue({
        title: input.title ?? deriveTitle(input.message),
        body,
        labels: ["feedback"],
      });
    } catch (e) {
      if (e instanceof GithubNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: FEEDBACK_ERROR_CODES.notConfigured,
          message: "Feedback is not configured",
        });
      }
      this.log.error(e instanceof Error ? e.message : "Issue creation failed");
      throw new HttpException(
        "Could not send feedback",
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { ok: true };
  }
}

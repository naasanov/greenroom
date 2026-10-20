import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { bands } from "./bands.js";
import { createdAt, id } from "./helpers.js";
import { users } from "./users.js";

export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    bandId: uuid("band_id").references(() => bands.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    pageUrl: text("page_url"),
    githubIssueNumber: integer("github_issue_number"),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_band_id_idx").on(t.bandId)],
);

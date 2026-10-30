ALTER TABLE "users" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "placeholder_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "placeholder_notes" text;
CREATE TABLE "calendar_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"event_id" uuid NOT NULL,
	"email" text NOT NULL,
	"uid" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_payload_hash" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_invites_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_invites" ADD CONSTRAINT "calendar_invites_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_invites_event_email_idx" ON "calendar_invites" USING btree ("kind","event_id","email");--> statement-breakpoint
CREATE INDEX "calendar_invites_band_id_idx" ON "calendar_invites" USING btree ("band_id");
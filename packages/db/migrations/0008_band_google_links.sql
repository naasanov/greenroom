CREATE TYPE "public"."google_link_service" AS ENUM('drive', 'calendar');--> statement-breakpoint
CREATE TABLE "band_google_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"service" "google_link_service" NOT NULL,
	"google_sub" text NOT NULL,
	"google_email" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"linked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "band_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "band_google_links" ADD CONSTRAINT "band_google_links_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "band_google_links" ADD CONSTRAINT "band_google_links_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "band_google_links_band_service_idx" ON "band_google_links" USING btree ("band_id","service");--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
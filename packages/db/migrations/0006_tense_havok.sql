CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"redirect_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
DROP INDEX "oauth_connections_user_provider_idx";--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "external_user_id" text;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "external_display_name" text;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_connections_user_provider_idx" ON "oauth_connections" USING btree ("user_id","provider");
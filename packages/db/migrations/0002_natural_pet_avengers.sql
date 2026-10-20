CREATE TABLE "user_instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"preset_key" text,
	"custom_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_instruments_one_of_preset_custom" CHECK (("user_instruments"."preset_key" is null) <> ("user_instruments"."custom_name" is null))
);
--> statement-breakpoint
DROP TABLE "member_instruments" CASCADE;--> statement-breakpoint
ALTER TABLE "user_instruments" ADD CONSTRAINT "user_instruments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_instruments_user_id_idx" ON "user_instruments" USING btree ("user_id");
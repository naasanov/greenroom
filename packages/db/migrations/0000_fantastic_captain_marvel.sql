CREATE TYPE "public"."oauth_provider" AS ENUM('google', 'spotify');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."practice_assignment_scope" AS ENUM('forward', 'single');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'maybe', 'not_going', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploading', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"google_sub" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"photo_url" text,
	"bio" text,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"booking_contact" text,
	"public_calendar_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"drive_root_folder_id" text,
	"drive_linked_by_user_id" uuid,
	"calendar_id" text,
	"calendar_linked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bands_slug_unique" UNIQUE("slug"),
	CONSTRAINT "bands_public_calendar_token_unique" UNIQUE("public_calendar_token")
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "member_instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"preset_key" text,
	"custom_name" text,
	CONSTRAINT "member_instruments_one_of_preset_custom" CHECK (("member_instruments"."preset_key" is null) <> ("member_instruments"."custom_name" is null))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gig_lineup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gigs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"load_in_at" timestamp with time zone,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"venue_name" text,
	"address" text,
	"google_place_id" text,
	"lat" double precision,
	"lng" double precision,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"notes" text,
	"show_on_public_calendar" boolean DEFAULT true NOT NULL,
	"drive_folder_id" text,
	"gcal_event_id" text,
	"gcal_etag" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_occurrence_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"original_start" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"title" text,
	"location" text,
	"gcal_instance_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"original_start" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "rsvp_status" DEFAULT 'no_response' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"rrule" text NOT NULL,
	"dtstart" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"gcal_event_id" text,
	"gcal_etag" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_setlist_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"scope" "practice_assignment_scope" NOT NULL,
	"setlist_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gig_setlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"setlist_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setlist_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"duration_seconds" integer,
	"spotify_track_id" text,
	"youtube_url" text,
	"image_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"name" text NOT NULL,
	"drive_folder_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"folder_id" uuid,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"thumbnail_url" text,
	"uploaded_by_user_id" uuid,
	"uploaded_via_link_id" uuid,
	"missing" boolean DEFAULT false NOT NULL,
	"trashed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "public_upload_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"max_file_bytes" bigint,
	"max_total_bytes" bigint,
	"allowed_mime_prefixes" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_upload_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"folder_id" uuid,
	"uploaded_by_user_id" uuid,
	"uploaded_via_link_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text,
	"file_fingerprint" text NOT NULL,
	"drive_session_url" text,
	"bytes_received" bigint DEFAULT 0 NOT NULL,
	"total_bytes" bigint NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"sync_token" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drive_sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"page_token" text NOT NULL,
	"last_polled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"band_id" uuid,
	"message" text NOT NULL,
	"page_url" text,
	"github_issue_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bands" ADD CONSTRAINT "bands_drive_linked_by_user_id_users_id_fk" FOREIGN KEY ("drive_linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bands" ADD CONSTRAINT "bands_calendar_linked_by_user_id_users_id_fk" FOREIGN KEY ("calendar_linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_instruments" ADD CONSTRAINT "member_instruments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_lineup" ADD CONSTRAINT "gig_lineup_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_lineup" ADD CONSTRAINT "gig_lineup_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_lineup" ADD CONSTRAINT "gig_lineup_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_occurrence_overrides" ADD CONSTRAINT "practice_occurrence_overrides_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_occurrence_overrides" ADD CONSTRAINT "practice_occurrence_overrides_series_id_practice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."practice_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_series_id_practice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."practice_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_rsvps" ADD CONSTRAINT "practice_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_series" ADD CONSTRAINT "practice_series_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_series" ADD CONSTRAINT "practice_series_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_setlist_assignments" ADD CONSTRAINT "practice_setlist_assignments_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_setlist_assignments" ADD CONSTRAINT "practice_setlist_assignments_series_id_practice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."practice_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_setlist_assignments" ADD CONSTRAINT "practice_setlist_assignments_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_setlists" ADD CONSTRAINT "gig_setlists_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_setlists" ADD CONSTRAINT "gig_setlists_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_setlists" ADD CONSTRAINT "gig_setlists_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_links" ADD CONSTRAINT "song_links_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploaded_via_link_id_public_upload_links_id_fk" FOREIGN KEY ("uploaded_via_link_id") REFERENCES "public"."public_upload_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_upload_links" ADD CONSTRAINT "public_upload_links_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_upload_links" ADD CONSTRAINT "public_upload_links_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_upload_links" ADD CONSTRAINT "public_upload_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_uploaded_via_link_id_public_upload_links_id_fk" FOREIGN KEY ("uploaded_via_link_id") REFERENCES "public"."public_upload_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_sync_cursors" ADD CONSTRAINT "drive_sync_cursors_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_connections_user_provider_idx" ON "oauth_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invite_links_band_id_idx" ON "invite_links" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "member_instruments_membership_id_idx" ON "member_instruments" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "memberships_band_id_idx" ON "memberships" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_band_user_idx" ON "memberships" USING btree ("band_id","user_id") WHERE "memberships"."left_at" is null;--> statement-breakpoint
CREATE INDEX "gig_lineup_band_id_idx" ON "gig_lineup" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "gig_lineup_gig_membership_idx" ON "gig_lineup" USING btree ("gig_id","membership_id");--> statement-breakpoint
CREATE INDEX "gigs_band_id_date_idx" ON "gigs" USING btree ("band_id","date");--> statement-breakpoint
CREATE INDEX "gigs_gcal_event_id_idx" ON "gigs" USING btree ("gcal_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_overrides_series_start_idx" ON "practice_occurrence_overrides" USING btree ("series_id","original_start");--> statement-breakpoint
CREATE INDEX "practice_overrides_band_id_idx" ON "practice_occurrence_overrides" USING btree ("band_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_rsvps_occurrence_user_idx" ON "practice_rsvps" USING btree ("series_id","original_start","user_id");--> statement-breakpoint
CREATE INDEX "practice_rsvps_band_id_idx" ON "practice_rsvps" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "practice_series_band_id_idx" ON "practice_series" USING btree ("band_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_assignments_series_from_scope_idx" ON "practice_setlist_assignments" USING btree ("series_id","effective_from","scope");--> statement-breakpoint
CREATE INDEX "practice_assignments_band_id_idx" ON "practice_setlist_assignments" USING btree ("band_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gig_setlists_gig_id_idx" ON "gig_setlists" USING btree ("gig_id");--> statement-breakpoint
CREATE INDEX "gig_setlists_band_id_idx" ON "gig_setlists" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "setlist_items_setlist_position_idx" ON "setlist_items" USING btree ("setlist_id","position");--> statement-breakpoint
CREATE INDEX "setlists_band_id_idx" ON "setlists" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "song_links_song_id_idx" ON "song_links" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "songs_band_id_idx" ON "songs" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "media_folders_band_id_idx" ON "media_folders" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "media_folders_gig_id_idx" ON "media_folders" USING btree ("gig_id");--> statement-breakpoint
CREATE INDEX "media_items_band_id_idx" ON "media_items" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "media_items_gig_folder_idx" ON "media_items" USING btree ("gig_id","folder_id");--> statement-breakpoint
CREATE INDEX "media_items_drive_file_id_idx" ON "media_items" USING btree ("drive_file_id");--> statement-breakpoint
CREATE INDEX "public_upload_links_band_id_idx" ON "public_upload_links" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "public_upload_links_gig_id_idx" ON "public_upload_links" USING btree ("gig_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_band_id_idx" ON "upload_sessions" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_gig_fingerprint_idx" ON "upload_sessions" USING btree ("gig_id","file_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_sync_states_band_id_idx" ON "calendar_sync_states" USING btree ("band_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drive_sync_cursors_band_id_idx" ON "drive_sync_cursors" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "feedback_band_id_idx" ON "feedback" USING btree ("band_id");
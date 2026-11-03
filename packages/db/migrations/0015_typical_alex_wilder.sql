CREATE INDEX "gig_setlists_setlist_id_idx" ON "gig_setlists" USING btree ("setlist_id");--> statement-breakpoint
CREATE INDEX "setlist_items_song_id_idx" ON "setlist_items" USING btree ("song_id");
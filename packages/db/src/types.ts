import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import * as s from "./schema/index.js";

export type Band = InferSelectModel<typeof s.bands>;
export type NewBand = InferInsertModel<typeof s.bands>;
export type Membership = InferSelectModel<typeof s.memberships>;
export type NewMembership = InferInsertModel<typeof s.memberships>;
export type MemberInstrument = InferSelectModel<typeof s.memberInstruments>;
export type NewMemberInstrument = InferInsertModel<typeof s.memberInstruments>;
export type InviteLink = InferSelectModel<typeof s.inviteLinks>;
export type NewInviteLink = InferInsertModel<typeof s.inviteLinks>;
export type Feedback = InferSelectModel<typeof s.feedback>;
export type NewFeedback = InferInsertModel<typeof s.feedback>;
export type Gig = InferSelectModel<typeof s.gigs>;
export type NewGig = InferInsertModel<typeof s.gigs>;
export type GigLineup = InferSelectModel<typeof s.gigLineup>;
export type NewGigLineup = InferInsertModel<typeof s.gigLineup>;
export type MediaFolder = InferSelectModel<typeof s.mediaFolders>;
export type NewMediaFolder = InferInsertModel<typeof s.mediaFolders>;
export type PublicUploadLink = InferSelectModel<typeof s.publicUploadLinks>;
export type NewPublicUploadLink = InferInsertModel<typeof s.publicUploadLinks>;
export type MediaItem = InferSelectModel<typeof s.mediaItems>;
export type NewMediaItem = InferInsertModel<typeof s.mediaItems>;
export type UploadSession = InferSelectModel<typeof s.uploadSessions>;
export type NewUploadSession = InferInsertModel<typeof s.uploadSessions>;
export type Song = InferSelectModel<typeof s.songs>;
export type NewSong = InferInsertModel<typeof s.songs>;
export type SongLink = InferSelectModel<typeof s.songLinks>;
export type NewSongLink = InferInsertModel<typeof s.songLinks>;
export type Setlist = InferSelectModel<typeof s.setlists>;
export type NewSetlist = InferInsertModel<typeof s.setlists>;
export type SetlistItem = InferSelectModel<typeof s.setlistItems>;
export type NewSetlistItem = InferInsertModel<typeof s.setlistItems>;
export type GigSetlist = InferSelectModel<typeof s.gigSetlists>;
export type NewGigSetlist = InferInsertModel<typeof s.gigSetlists>;
export type PracticeSeries = InferSelectModel<typeof s.practiceSeries>;
export type NewPracticeSeries = InferInsertModel<typeof s.practiceSeries>;
export type PracticeOccurrenceOverride = InferSelectModel<
  typeof s.practiceOccurrenceOverrides
>;
export type NewPracticeOccurrenceOverride = InferInsertModel<
  typeof s.practiceOccurrenceOverrides
>;
export type PracticeRsvp = InferSelectModel<typeof s.practiceRsvps>;
export type NewPracticeRsvp = InferInsertModel<typeof s.practiceRsvps>;
export type PracticeSetlistAssignment = InferSelectModel<
  typeof s.practiceSetlistAssignments
>;
export type NewPracticeSetlistAssignment = InferInsertModel<
  typeof s.practiceSetlistAssignments
>;
export type DriveSyncCursor = InferSelectModel<typeof s.driveSyncCursors>;
export type NewDriveSyncCursor = InferInsertModel<typeof s.driveSyncCursors>;
export type CalendarSyncState = InferSelectModel<typeof s.calendarSyncStates>;
export type NewCalendarSyncState = InferInsertModel<
  typeof s.calendarSyncStates
>;
export type User = InferSelectModel<typeof s.users>;
export type NewUser = InferInsertModel<typeof s.users>;
export type MagicLinkToken = InferSelectModel<typeof s.magicLinkTokens>;
export type NewMagicLinkToken = InferInsertModel<typeof s.magicLinkTokens>;
export type Session = InferSelectModel<typeof s.sessions>;
export type NewSession = InferInsertModel<typeof s.sessions>;
export type OauthConnection = InferSelectModel<typeof s.oauthConnections>;
export type NewOauthConnection = InferInsertModel<typeof s.oauthConnections>;

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Greenroom",
  description: "How Greenroom collects, uses, and shares your data.",
};

const GOOGLE_POLICY =
  "https://developers.google.com/terms/api-services-user-data-policy";

const linkClass = "underline underline-offset-4 hover:text-foreground";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        &larr; Back to Greenroom
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated October 26, 2026
      </p>

      <div className="mt-8 space-y-8 leading-relaxed text-foreground/90 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p+p]:mt-3">
        <section>
          <h2>What Greenroom is</h2>
          <p>
            Greenroom is a home base for a small band: gigs, practices,
            setlists, the roster, and gig media in one place.
          </p>
        </section>

        <section>
          <h2>What we collect</h2>
          <p>
            Your name, email address, and profile photo from Google sign-in, or
            the email address you use to request a sign-in link.
          </p>
          <p>
            Band data you enter: events, songs, setlists, lineups, notes,
            instruments, and an optional calendar email.
          </p>
        </section>

        <section>
          <h2>Google data</h2>
          <p>
            When a band links Google Drive, Greenroom reads and writes files in
            the folder the band picked, to store and show gig media and profile
            photos. When a band links Google Calendar, Greenroom creates a band
            calendar and keeps events and RSVPs in sync.
          </p>
          <p>
            Tokens are stored encrypted on our servers and used only for these
            features.
          </p>
          <p>
            Greenroom&apos;s use of information received from Google APIs
            adheres to the{" "}
            <a href={GOOGLE_POLICY} className={linkClass}>
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p>
            We do not sell data, use it for ads, or let humans read it except
            for security, legal compliance, or with your permission to debug a
            problem.
          </p>
        </section>

        <section>
          <h2>Spotify</h2>
          <p>
            Spotify is used for song search and, if you connect your account,
            for importing and exporting playlists.
          </p>
        </section>

        <section>
          <h2>Sharing</h2>
          <p>
            Band data is visible to members of that band. Gigs marked public
            appear on the band&apos;s public calendar, showing only the title,
            date, and venue.
          </p>
          <p>
            We run on these service providers: Fly.io (hosting), Cloudflare
            (DNS), Resend (sign-in emails), and Sentry (error reports).
          </p>
        </section>

        <section>
          <h2>Deleting your data</h2>
          <p>
            You can leave a band, delete a band, or disconnect Google or Spotify
            from settings. To delete your account, email us. You can also revoke
            access at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className={linkClass}
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
          <p>
            Media stays in your band&apos;s Google Drive, which you control.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            <a href="mailto:nicolas.a.asanov@gmail.com" className={linkClass}>
              nicolas.a.asanov@gmail.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}

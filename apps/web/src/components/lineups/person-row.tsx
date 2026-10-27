import type { BandMember } from "@greenroom/shared";
import { InstrumentIcon, instrumentLabel } from "@/components/app/instruments";
import { MemberAvatar } from "@/components/roster/member-avatar";
import { memberInstruments } from "@/components/roster/member-utils";
import { cn } from "@/lib/utils";

export interface PersonData {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Avatar, name and up to three instrument icons; fills the space between a row's controls. */
export function PersonLine({
  person,
  member,
  left,
}: {
  person: PersonData;
  /** The band member record, when known, for instrument icons. */
  member?: BandMember;
  left?: boolean;
}) {
  const instruments = member ? memberInstruments(member) : [];
  return (
    <>
      <MemberAvatar member={person} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm leading-tight font-semibold">
          {person.displayName}
        </span>
        {left ? (
          <span
            data-testid="left-tag"
            className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] leading-none text-muted-foreground"
          >
            Left the band
          </span>
        ) : null}
      </span>
      {instruments.length > 0 ? (
        <ul
          aria-label="Instruments"
          className="flex shrink-0 items-center gap-1.5 text-muted-foreground"
        >
          {instruments.slice(0, 3).map((i) => (
            <li key={i} title={instrumentLabel(i)}>
              <InstrumentIcon instrument={i} className="size-5" />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** The floating copy of a row shown under the cursor while dragging. */
export function PersonOverlay({
  person,
  member,
  className,
}: {
  person: PersonData;
  member?: BandMember;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-14 cursor-grabbing items-center gap-2.5 rounded-2xl border border-primary/40 bg-card px-3 shadow-lift",
        className,
      )}
    >
      <PersonLine person={person} member={member} />
    </div>
  );
}

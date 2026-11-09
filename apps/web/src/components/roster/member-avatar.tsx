import type { BandMember } from "@greenroom/shared";
import { toneFor } from "@/components/app/event-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Round photo, or the first initial on a tint derived from the user id. */
export function MemberAvatar({
  member,
  className,
  letters = 1,
}: {
  member: Pick<BandMember, "userId" | "displayName" | "avatarUrl">;
  className?: string;
  /** How many initials the fallback shows. */
  letters?: 1 | 2;
}) {
  const src = member.avatarUrl;
  return (
    <Avatar className={cn("size-16", className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt=""
          className="[image-orientation:from-image]"
        />
      ) : null}
      <AvatarFallback
        className={cn(
          "font-semibold",
          letters === 2 ? "text-sm" : "text-xl",
          toneFor(member.userId),
        )}
      >
        {member.displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, letters)
          .map((p) => p[0]?.toUpperCase())
          .join("")}
      </AvatarFallback>
    </Avatar>
  );
}

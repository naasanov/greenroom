import type { BandMember } from "@greenroom/shared";
import { toneFor } from "@/components/app/event-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Round photo, or the first initial on a tint derived from the user id. */
export function MemberAvatar({
  member,
  className,
}: {
  member: Pick<BandMember, "userId" | "displayName" | "avatarUrl">;
  className?: string;
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
        className={cn("text-xl font-semibold", toneFor(member.userId))}
      >
        {member.displayName.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

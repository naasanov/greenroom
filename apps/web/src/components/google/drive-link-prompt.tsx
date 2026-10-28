"use client";

import { FolderOpen, HardDrive, Link2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DriveFolderPicker } from "@/components/google/drive-folder-picker";
import { Button } from "@/components/ui/button";
import { connectGoogle, useGoogleIntegrations } from "@/lib/queries/google";

/** Unlinked-media state: link Drive now, or finish choosing its folder. */
export function DriveLinkPrompt({ bandId }: { bandId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const integrations = useGoogleIntegrations(bandId);
  const [picking, setPicking] = useState(false);
  const linked = integrations.data?.drive.linked === true;

  return (
    <div
      data-testid="drive-link-prompt"
      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2"
    >
      <HardDrive className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {linked
          ? "Google Drive is linked, but no folder has been chosen yet."
          : "This band hasn't been linked to a Google Drive yet."}
      </p>
      {integrations.data ? (
        linked ? (
          <Button
            variant="outline"
            size="sm"
            aria-label="Choose folder"
            onClick={() => setPicking(true)}
          >
            <FolderOpen />
            Choose
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            aria-label="Link Google Drive"
            onClick={() =>
              connectGoogle(
                bandId,
                "drive",
                search ? `${pathname}?${search}` : pathname,
              )
            }
          >
            <Link2 />
            Connect
          </Button>
        )
      ) : null}
      <DriveFolderPicker
        bandId={bandId}
        open={picking}
        onOpenChange={setPicking}
      />
    </div>
  );
}

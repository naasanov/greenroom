"use client";

import { HardDrive } from "lucide-react";
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
      className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <HardDrive className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm">
          {linked
            ? "Google Drive is linked, but no folder has been chosen yet."
            : "This band hasn't been linked to a Google Drive yet."}
        </p>
      </div>
      {integrations.data ? (
        linked ? (
          <Button variant="outline" onClick={() => setPicking(true)}>
            Choose folder
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              connectGoogle(
                bandId,
                "drive",
                search ? `${pathname}?${search}` : pathname,
              )
            }
          >
            Link Google Drive
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

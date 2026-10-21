"use client";

import { Link2Off } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";

export function NoAccess({
  error,
  tab,
}: {
  error: unknown;
  tab: "events" | "library";
}) {
  const missing = isApiError(error, 404);
  return (
    <EmptyState
      className="py-24"
      icon={Link2Off}
      title={
        missing
          ? "This link doesn't exist or you don't have access"
          : "Something went wrong"
      }
      description={
        missing
          ? "Ask a bandmate to send the link again."
          : "Please reload and try again."
      }
      action={
        <Button asChild variant="secondary">
          <Link href={`/${tab}`}>
            {tab === "events" ? "Go to Events" : "Go to Music Library"}
          </Link>
        </Button>
      }
    />
  );
}

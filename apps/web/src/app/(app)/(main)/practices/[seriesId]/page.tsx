"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PracticeLinkView } from "@/components/onboarding/deep-link-views";

function PracticeLinkPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const date = useSearchParams().get("date");
  return <PracticeLinkView seriesId={seriesId} date={date} />;
}

export default function Page() {
  return (
    <Suspense>
      <PracticeLinkPage />
    </Suspense>
  );
}

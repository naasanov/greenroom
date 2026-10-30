"use client";

import { useParams } from "next/navigation";
import { StageView } from "@/components/stage/stage-view";

export default function GigStagePage() {
  const { gigId } = useParams<{ gigId: string }>();
  return <StageView gigId={gigId} />;
}

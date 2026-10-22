import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { parsePlan } from "@/lib/plan";
import { parseSetupDoc, type SetupSection } from "@/lib/setup-doc";
import { ManualSetup } from "@/components/status/manual-setup";
import { PlanTree } from "@/components/status/plan-tree";
import { Summary } from "@/components/status/summary";

export const metadata: Metadata = {
  title: "Greenroom build status",
  robots: { index: false },
};

const RAW_URL =
  "https://raw.githubusercontent.com/naasanov/greenroom/main/docs/execution-plan.md";
const GITHUB_URL =
  "https://github.com/naasanov/greenroom/blob/main/docs/execution-plan.md";

async function loadPlan() {
  try {
    const res = await fetch(RAW_URL, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const plan = parsePlan(await res.text());
    return plan.phases.length > 0 ? plan : null;
  } catch {
    return null;
  }
}

const SETUP_URL =
  "https://raw.githubusercontent.com/naasanov/greenroom/main/docs/manual-setup.md";

async function loadSetupDoc(): Promise<SetupSection[]> {
  try {
    const res = await fetch(SETUP_URL, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return parseSetupDoc(await res.text());
  } catch {
    return [];
  }
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <Suspense fallback={<Skeleton />}>
        <StatusContent />
      </Suspense>
    </main>
  );
}

// Rendered per request (the fetch itself is cached for 60s), never at build time.
async function StatusContent() {
  await connection();
  const [plan, setupSections] = await Promise.all([loadPlan(), loadSetupDoc()]);
  const fetchedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Greenroom build status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last fetched {fetchedAt} UTC (refreshes every minute).{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
          >
            View the plan on GitHub
            <ExternalLink className="size-3" />
          </a>
        </p>
      </header>

      {plan ? (
        <div className="space-y-8">
          <Summary plan={plan} />
          <PlanTree plan={plan} />
          <ManualSetup plan={plan} sections={setupSections} />
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <TriangleAlert className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Could not load the plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            GitHub did not return the execution plan. Reload in a minute, or
            read it directly on GitHub.
          </p>
        </div>
      )}
    </>
  );
}

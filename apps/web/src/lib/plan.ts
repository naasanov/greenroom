export type StatusKind =
  "done" | "in-progress" | "review" | "blocked" | "not-started";

export type PlanStatus = { kind: StatusKind; text: string };

export type PlanTask = {
  type: "task";
  id: string;
  title: string;
  description: string;
  group?: string;
  status: PlanStatus;
};

export type PlanGate = {
  type: "gate";
  number: number;
  title: string;
  description: string;
  status: PlanStatus;
};

export type PlanItem = PlanTask | PlanGate;

export type PlanPhase = { number: number; title: string; items: PlanItem[] };

export type ManualItem = {
  name: string;
  description: string;
  status: PlanStatus;
};

export type Plan = {
  phases: PlanPhase[];
  manual: ManualItem[];
  questions: string[];
};

/** Maps the leading words of a status string to a status kind. */
export function classifyStatus(text: string): StatusKind {
  const t = text.trim().toLowerCase();
  if (t.startsWith("done") || t.startsWith("approved")) return "done";
  if (t.startsWith("in progress") || t.startsWith("feedback"))
    return "in-progress";
  if (t.startsWith("awaiting review")) return "review";
  if (t.startsWith("blocked")) return "blocked";
  return "not-started";
}

/** Splits "description. Status: text" into its two parts. */
function splitStatus(rest: string): {
  description: string;
  status: PlanStatus;
} {
  const match = /\bStatus:\s*/i.exec(rest);
  const text = match ? rest.slice(match.index + match[0].length).trim() : "";
  const description = (match ? rest.slice(0, match.index) : rest).trim();
  return {
    description,
    status: { kind: classifyStatus(text), text: text || "Not started" },
  };
}

const PHASE = /^#\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$/i;
const HEADING = /^#\s+(.+?)\s*$/;
const GROUP = /^Parallel group\s+(\S+)/i;
const TASK = /^[-*]\s+\*\*(\d+(?:\.\d+)+)\s+(.+?)\.?\*\*\s*(.*)$/;
const GATE = /^\W*\*\*GATE\s+(\d+)\s*[:.-]\s*(.+?)\.?\*\*\s*(.*)$/i;
const BOLD_BULLET = /^[-*]\s+\*\*(.+?)\*\*\s*(.*)$/;

/** Parses the execution plan markdown. Never throws; unparseable lines are skipped. */
export function parsePlan(markdown: string): Plan {
  const plan: Plan = { phases: [], manual: [], questions: [] };
  let section: "phase" | "manual" | "questions" | "other" = "other";
  let phase: PlanPhase | null = null;
  let group: string | undefined;

  try {
    for (const raw of markdown.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;

      const phaseMatch = PHASE.exec(line);
      if (phaseMatch) {
        phase = {
          number: Number(phaseMatch[1]),
          title: phaseMatch[2],
          items: [],
        };
        plan.phases.push(phase);
        section = "phase";
        group = undefined;
        continue;
      }
      const heading = HEADING.exec(line);
      if (heading) {
        const name = heading[1].toLowerCase();
        section = name.startsWith("manual setup")
          ? "manual"
          : name.startsWith("open questions")
            ? "questions"
            : "other";
        phase = null;
        continue;
      }

      if (section === "phase" && phase) {
        const g = GROUP.exec(line);
        if (g) {
          group = g[1];
          continue;
        }
        const gate = GATE.exec(line);
        if (gate) {
          const { description, status } = splitStatus(gate[3]);
          phase.items.push({
            type: "gate",
            number: Number(gate[1]),
            title: gate[2].trim(),
            description,
            status,
          });
          continue;
        }
        const task = TASK.exec(line);
        if (task) {
          const { description, status } = splitStatus(task[3]);
          phase.items.push({
            type: "task",
            id: task[1],
            title: task[2].trim(),
            description,
            group,
            status,
          });
        }
      } else if (section === "manual") {
        const m = BOLD_BULLET.exec(line);
        if (m && /\bStatus:/i.test(m[2])) {
          const { description, status } = splitStatus(m[2]);
          plan.manual.push({
            name: m[1].replace(/:\s*$/, "").trim(),
            description,
            status,
          });
        }
      } else if (section === "questions") {
        const q = /^[-*]\s+(.+)$/.exec(line);
        if (q && !/^\(none/i.test(q[1])) plan.questions.push(q[1]);
      }
    }
  } catch {
    // Returns whatever was parsed before the failure.
  }
  return plan;
}

/** Tasks and gates of a plan in tree order. */
export function allItems(plan: Plan): PlanItem[] {
  return plan.phases.flatMap((p) => p.items);
}

/** The first item that is not done, or null when everything is done. */
export function currentItem(plan: Plan): PlanItem | null {
  return allItems(plan).find((i) => i.status.kind !== "done") ?? null;
}

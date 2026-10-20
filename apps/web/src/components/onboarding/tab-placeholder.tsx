import { Calendar, ListMusic } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";

const PLACEHOLDERS = {
  events: {
    icon: Calendar,
    title: "Events",
    description: "Gigs and practices will live here soon.",
  },
  library: {
    icon: ListMusic,
    title: "Music Library",
    description: "Your band's songs and setlists will live here soon.",
  },
} as const;

export function TabPlaceholder({ tab }: { tab: keyof typeof PLACEHOLDERS }) {
  return <EmptyState className="py-24" {...PLACEHOLDERS[tab]} />;
}

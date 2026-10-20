import type { Metadata } from "next";
import { Showcase } from "@/components/showcase/showcase";

export const metadata: Metadata = {
  title: "Components | Greenroom",
  description: "Every Greenroom UI component in its meaningful states.",
};

export default function ShowcasePage() {
  return <Showcase />;
}

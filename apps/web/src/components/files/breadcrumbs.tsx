"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import type { FilesBreadcrumb } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const hrefFor = (crumbs: FilesBreadcrumb[], i: number) =>
  i === 0 ? "/files" : `/files/${crumbs[i]!.id}`;
const labelFor = (c: FilesBreadcrumb, i: number) =>
  i === 0 ? "Files" : c.name;

function Chevron() {
  return (
    <ChevronRight
      aria-hidden
      className="mx-0.5 size-4 shrink-0 text-muted-foreground"
    />
  );
}

/** Clickable path; on phones the middle folders collapse into an overflow menu. */
export function Breadcrumbs({ crumbs }: { crumbs: FilesBreadcrumb[] }) {
  const last = crumbs.length - 1;
  const collapsible = last >= 3;
  return (
    <nav aria-label="Breadcrumb" data-testid="files-breadcrumbs">
      <ol className="flex min-w-0 items-center text-sm">
        {crumbs.map((c, i) => {
          const middle = collapsible && i > 0 && i < last;
          const isLast = i === last;
          return (
            <Fragment key={c.id}>
              {collapsible && i === 1 ? (
                <li className="flex items-center md:hidden">
                  <Chevron />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Show hidden folders"
                        className="text-muted-foreground"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {crumbs.slice(1, last).map((m, j) => (
                        <DropdownMenuItem key={m.id} asChild>
                          <Link href={hrefFor(crumbs, j + 1)}>{m.name}</Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ) : null}
              <li
                className={cn(
                  "flex min-w-0 items-center",
                  middle && "hidden md:flex",
                )}
              >
                {i > 0 ? <Chevron /> : null}
                {isLast ? (
                  <span
                    aria-current="page"
                    className="flex min-h-11 min-w-0 items-center px-2 font-semibold"
                  >
                    <span className="truncate">{labelFor(c, i)}</span>
                  </span>
                ) : (
                  <Link
                    href={hrefFor(crumbs, i)}
                    className="flex min-h-11 min-w-0 items-center rounded-lg px-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate">{labelFor(c, i)}</span>
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

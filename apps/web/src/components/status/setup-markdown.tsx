import type { ReactNode } from "react";
import { parseBlocks, type Block, type ListNode } from "@/lib/setup-doc";
import { CopyButton } from "./copy-button";

const DOCS_BASE = "https://github.com/naasanov/greenroom/blob/main/docs/";
const TOKEN = /(`[^`]+`|\*\*.+?\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)`]+)/;
const KEYCHAIN_NAME = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
const COMMAND = /^[a-z][\w.-]*\s.*\s-\w/;

function resolveHref(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith("#")) return `${DOCS_BASE}manual-setup.md${href}`;
  return DOCS_BASE + href.replace(/^\.\//, "");
}

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-words font-medium text-primary underline underline-offset-2 [overflow-wrap:anywhere]"
    >
      {children}
    </a>
  );
}

function Code({ text }: { text: string }) {
  const copyable = KEYCHAIN_NAME.test(text) || COMMAND.test(text);
  const code = (
    <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {text}
    </code>
  );
  if (!copyable) return code;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1 align-middle">
      {code}
      <CopyButton text={text} />
    </span>
  );
}

/** Renders inline code, bold, links, and bare URLs as React elements. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith("`"))
          return <Code key={i} text={part.slice(1, -1)} />;
        if (part.startsWith("**"))
          return (
            <strong key={i} className="font-semibold text-foreground">
              <Inline text={part.slice(2, -2)} />
            </strong>
          );
        if (part.startsWith("[")) {
          const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
          if (m)
            return (
              <Anchor key={i} href={resolveHref(m[2])}>
                {m[1]}
              </Anchor>
            );
        }
        const url = part.replace(/[.,;:!?]+$/, "");
        return (
          <span key={i}>
            <Anchor href={url}>{url}</Anchor>
            {part.slice(url.length)}
          </span>
        );
      })}
    </>
  );
}

function List({ ordered, items }: { ordered: boolean; items: ListNode[] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={
        ordered
          ? "list-decimal space-y-2 pl-5 marker:font-medium marker:text-muted-foreground"
          : "list-disc space-y-1.5 pl-5 marker:text-muted-foreground"
      }
    >
      {items.map((item, i) => (
        <li key={i} className="min-w-0 break-words pl-1">
          <Inline text={item.text} />
          {item.children.length > 0 && (
            <div className="mt-1.5">
              <ChildLists nodes={item.children} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  );
}

function ChildLists({ nodes }: { nodes: ListNode[] }) {
  const groups: { ordered: boolean; items: ListNode[] }[] = [];
  for (const n of nodes) {
    const last = groups[groups.length - 1];
    if (last && last.ordered === n.ordered) last.items.push(n);
    else groups.push({ ordered: n.ordered, items: [n] });
  }
  return (
    <>
      {groups.map((g, i) => (
        <List key={i} ordered={g.ordered} items={g.items} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  return block.type === "p" ? (
    <p className="break-words">
      <Inline text={block.text} />
    </p>
  ) : (
    <List ordered={block.ordered} items={block.items} />
  );
}

/** Renders the doc's markdown subset (paragraphs, nested lists, inline spans). */
export function SetupMarkdown({ body }: { body: string }) {
  return (
    <div className="min-w-0 space-y-3 text-sm leading-relaxed text-muted-foreground">
      {parseBlocks(body).map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

export type SetupSection = { heading: string; body: string };

export type ListNode = {
  ordered: boolean;
  text: string;
  indent: number;
  children: ListNode[];
};

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; ordered: boolean; items: ListNode[] };

/** Splits the setup doc into sections keyed by `##` heading. Never throws. */
export function parseSetupDoc(markdown: string): SetupSection[] {
  const raw: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  try {
    for (const line of markdown.split(/\r?\n/)) {
      const h = /^##\s+(.+?)\s*$/.exec(line);
      if (h) {
        current = { heading: h[1], lines: [] };
        raw.push(current);
      } else if (/^#\s/.test(line)) {
        current = null;
      } else if (current) {
        current.lines.push(line);
      }
    }
  } catch {
    // Returns whatever was parsed before the failure.
  }
  return raw.map((s) => ({
    heading: s.heading,
    body: s.lines.join("\n").trim(),
  }));
}

/** Finds the section whose heading equals the name, ignoring case. */
export function findSection(
  sections: SetupSection[],
  name: string,
): SetupSection | undefined {
  const n = name.trim().toLowerCase();
  return sections.find((s) => s.heading.trim().toLowerCase() === n);
}

const LIST_LINE = /^(\s*)(?:(\d+)\.|[-*])\s+(.*)$/;

/** Parses the markdown subset used by the doc into paragraphs and nested lists. */
export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let stack: ListNode[] = [];
  let top: Extract<Block, { type: "list" }> | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) {
      flushPara();
      stack = [];
      top = null;
      continue;
    }
    const m = LIST_LINE.exec(line);
    if (m) {
      flushPara();
      const node: ListNode = {
        ordered: m[2] !== undefined,
        text: m[3],
        indent: m[1].length,
        children: [],
      };
      while (stack.length && stack[stack.length - 1].indent >= node.indent)
        stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        if (!top || top.ordered !== node.ordered) {
          top = { type: "list", ordered: node.ordered, items: [] };
          blocks.push(top);
        }
        top.items.push(node);
      }
      stack.push(node);
    } else if (stack.length) {
      stack[stack.length - 1].text += ` ${line.trim()}`;
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}

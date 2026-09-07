/**
 * The agent answers in Markdown, but only ever uses five things: a heading, a
 * bullet list, a numbered list, a quote, and `**bold**` / `*em*` / `` `code` ``
 * inside a line. So this renders exactly those, as React elements.
 *
 * Not a Markdown library and not `dangerouslySetInnerHTML`: the text comes back
 * from an LLM, and building elements means there is no path from model output
 * to markup at all.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

/** `**bold**`, `*em*` and `` `code` ``. The capturing group keeps the matches. */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE).filter((part) => part !== "");
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-text">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[12.5px] text-text"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
          return (
            <em key={i} className="text-accent not-italic">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flush();
      continue;
    }

    if (line.startsWith("### ") || line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h3", text: line.replace(/^#{2,3}\s+/, "") });
      continue;
    }

    if (line.startsWith("> ")) {
      flush();
      blocks.push({ kind: "quote", text: line.slice(2) });
      continue;
    }

    const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (list?.kind !== "ol") {
        flush();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ordered[2]);
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (list?.kind !== "ul") {
        flush();
        list = { kind: "ul", items: [] };
      }
      list.items.push(line.slice(2));
      continue;
    }

    flush();
    blocks.push({ kind: "p", text: line });
  }

  flush();
  return blocks;
}

export function AnswerBody({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);

  return (
    <div className="space-y-3 text-[14.5px] leading-[1.85] text-text-2">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h3":
            return (
              <h3
                key={i}
                className="pt-2 font-display text-[14.5px] font-semibold tracking-tight text-text"
              >
                <Inline text={block.text} />
              </h3>
            );

          case "quote":
            return (
              <blockquote
                key={i}
                className="rounded-r-xl border-l-2 border-accent-line bg-accent-soft px-3.5 py-2.5 text-[13.5px] text-text-2"
              >
                <Inline text={block.text} />
              </blockquote>
            );

          case "ul":
            return (
              <ul key={i} className="space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-[11px] size-[5px] shrink-0 rounded-full bg-accent" />
                    <span className="min-w-0">
                      <Inline text={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={i} className="space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-md bg-accent-soft font-mono text-[10.5px] tabular-nums text-accent">
                      {j + 1}
                    </span>
                    <span className="min-w-0">
                      <Inline text={item} />
                    </span>
                  </li>
                ))}
              </ol>
            );

          default:
            return (
              <p key={i}>
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

import { Fragment } from "react";

type LinkifiedTextProps = {
  text: string;
  className?: string;
};

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|www\.[^\s)]+)\)/gi;
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function countChar(value: string, target: string): number {
  let count = 0;
  for (const ch of value) {
    if (ch === target) count++;
  }
  return count;
}

function splitTrailingPunctuation(value: string): { core: string; suffix: string } {
  let end = value.length;

  while (end > 0) {
    const ch = value[end - 1];
    if (ch === "." || ch === "," || ch === ";" || ch === "!" || ch === "?" || ch === "…") {
      end--;
      continue;
    }
    break;
  }

  while (end > 0 && value[end - 1] === ")") {
    const segment = value.slice(0, end);
    if (countChar(segment, ")") > countChar(segment, "(")) {
      end--;
      continue;
    }
    break;
  }

  while (end > 0 && value[end - 1] === "]") {
    const segment = value.slice(0, end);
    if (countChar(segment, "]") > countChar(segment, "[")) {
      end--;
      continue;
    }
    break;
  }

  return {
    core: value.slice(0, end),
    suffix: value.slice(end),
  };
}

function normalizeHref(urlText: string): string {
  if (/^https?:\/\//i.test(urlText)) return urlText;
  return `https://${urlText}`;
}

export function LinkifiedText(props: LinkifiedTextProps) {
  const text = props.text ?? "";
  const parts: Array<{ type: "text"; value: string } | { type: "link"; value: string; href: string; suffix: string }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    MARKDOWN_LINK_PATTERN.lastIndex = cursor;
    URL_PATTERN.lastIndex = cursor;

    const markdownMatch = MARKDOWN_LINK_PATTERN.exec(text);
    const urlMatch = URL_PATTERN.exec(text);

    const markdownIndex = markdownMatch?.index ?? Number.POSITIVE_INFINITY;
    const urlIndex = urlMatch?.index ?? Number.POSITIVE_INFINITY;

    if (!Number.isFinite(markdownIndex) && !Number.isFinite(urlIndex)) {
      break;
    }

    if (markdownIndex <= urlIndex && markdownMatch) {
      const fullMatch = markdownMatch[0] ?? "";
      const label = markdownMatch[1] ?? "";
      const hrefRaw = markdownMatch[2] ?? "";
      if (markdownIndex > cursor) {
        parts.push({ type: "text", value: text.slice(cursor, markdownIndex) });
      }
      parts.push({
        type: "link",
        value: label || hrefRaw,
        href: normalizeHref(hrefRaw),
        suffix: "",
      });
      cursor = markdownIndex + fullMatch.length;
      continue;
    }

    if (urlMatch) {
      const matched = urlMatch[0] ?? "";
      const index = urlMatch.index ?? cursor;
      if (index > cursor) {
        parts.push({ type: "text", value: text.slice(cursor, index) });
      }

      const { core, suffix } = splitTrailingPunctuation(matched);
      if (core) {
        parts.push({
          type: "link",
          value: core,
          href: normalizeHref(core),
          suffix,
        });
      } else {
        parts.push({ type: "text", value: matched });
      }
      cursor = index + matched.length;
      continue;
    }

    break;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return (
    <span className={props.className}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <Fragment key={`text-${index}`}>{part.value}</Fragment>;
        }
        return (
          <Fragment key={`link-${index}`}>
            <a
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
              className="linkifiedTextLink"
            >
              {part.value}
            </a>
            {part.suffix}
          </Fragment>
        );
      })}
    </span>
  );
}

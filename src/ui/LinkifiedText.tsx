import { Fragment } from "react";

type LinkifiedTextProps = {
  text: string;
  className?: string;
};

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function splitTrailingPunctuation(value: string): { core: string; suffix: string } {
  const match = value.match(/[),.;!?]+$/);
  if (!match) return { core: value, suffix: "" };
  const suffix = match[0];
  const core = value.slice(0, value.length - suffix.length);
  return { core, suffix };
}

function normalizeHref(urlText: string): string {
  if (/^https?:\/\//i.test(urlText)) return urlText;
  return `https://${urlText}`;
}

export function LinkifiedText(props: LinkifiedTextProps) {
  const text = props.text ?? "";
  const parts: Array<{ type: "text"; value: string } | { type: "link"; value: string; href: string; suffix: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matched = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
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
    lastIndex = index + matched.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
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

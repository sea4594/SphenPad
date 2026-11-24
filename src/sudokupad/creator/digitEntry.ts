import { creatorGridValueError } from "./gridStructure";

export type CreatorDigitSequence = { context: string; prefix: string; at: number };
export type CreatorDigitTransition = { value?: string; pending?: CreatorDigitSequence; error?: string };

/** Combine successive one-key digit presses without appending to an already authored cell value.
 * The prefix lives only in UI memory; incomplete values never enter the persisted project. */
export function creatorDigitTransition(
  input: string, context: string, range: { min: number; max: number },
  previous: CreatorDigitSequence | null, now: number,
): CreatorDigitTransition {
  if (input === "") return { value: "" };
  if (!/^\d$/.test(input)) return { error: "Use numeric digits to enter givens or solution values." };
  const recent = previous && previous.context === context && now >= previous.at && now - previous.at < 1200;
  const combined = recent ? `${previous.prefix}${input}` : input;
  const possible = Array.from({ length: range.max - range.min + 1 }, (_, i) => String(range.min + i));
  const candidate = possible.some((item) => item === combined || item.startsWith(combined)) ? combined : input;
  if (candidate === "0") return { value: "" };
  const matching = possible.includes(candidate);
  const prefix = possible.some((item) => item.length > candidate.length && item.startsWith(candidate));
  if (!matching && !prefix) return { error: creatorGridValueError(candidate, range.min, range.max) };
  const pending = prefix ? { context, prefix: candidate, at: now } : undefined;
  return { ...(matching ? { value: candidate } : {}), ...(pending ? { pending } : {}) };
}

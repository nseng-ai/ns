export {
  formatCommand,
  formatOutputSection,
  formatShellArg,
  tailText,
} from "@sdl/core/exec";
export { formatErrorMessage } from "@sdl/core/primitives";

export function truncateText(text: string, maxChars: number): string {
  const normalizedMaxChars = Math.max(0, Math.trunc(maxChars));
  if (text.length <= normalizedMaxChars) return text;
  if (normalizedMaxChars === 0) return "…";
  return `${text.slice(0, normalizedMaxChars)}\n…[truncated]`;
}


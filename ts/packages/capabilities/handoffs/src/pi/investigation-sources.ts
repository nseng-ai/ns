import { buildFencedTextBlock } from "@nseng-ai/foundation/primitives";
import type { SessionManagerLike } from "./runtime-types.ts";

const UNAVAILABLE_SESSION_ID = "unavailable (no Pi session id was exposed)";
const UNAVAILABLE_SESSION_LOG = "unavailable (no persisted Pi session log was exposed)";

export interface HandoffInvestigationSourceOptions {
	readonly sourceSessionFile?: string;
	readonly sourceSessionId?: string;
}

export function deriveHandoffInvestigationSources(context: {
	readonly sessionManager?: SessionManagerLike;
}): HandoffInvestigationSourceOptions {
	const sourceSessionFile = context.sessionManager?.getSessionFile?.();
	const sourceSessionId = context.sessionManager?.getSessionId?.();
	return {
		...(sourceSessionFile === undefined ? {} : { sourceSessionFile }),
		...(sourceSessionId === undefined ? {} : { sourceSessionId }),
	};
}

/**
 * Derive a compact source Pi session id from a session file path. Pi names
 * session files `<timestamp>_<id>` (for example,
 * `2026-06-12T06-03-30-136Z_019eba6d-abd8-7fa8-bb1f-1888f3b09a56.jsonl`), so
 * only the id segment after the timestamp prefix is retained. Returns
 * undefined when no usable id can be extracted.
 */
export function deriveSourcePiSessionId(sessionFile: string | undefined): string | undefined {
	if (sessionFile === undefined) return undefined;

	const basename = sessionFile.trim().split(/[/\\]/).pop() ?? "";
	const stem = basename.replace(/\.[^.]+$/, "");
	const id = stem.slice(stem.lastIndexOf("_") + 1);
	return id === "" ? undefined : id;
}

export function resolveSourcePiSessionId(
	options: HandoffInvestigationSourceOptions,
): string | undefined {
	return (
		normalizeValue(options.sourceSessionId) ??
		deriveSourcePiSessionId(normalizeSessionFile(options.sourceSessionFile))
	);
}

export function buildHandoffInvestigationSourcesPrompt(
	options: HandoffInvestigationSourceOptions = {},
): string {
	const normalizedSessionFile = normalizeSessionFile(options.sourceSessionFile);
	const sessionId = resolveSourcePiSessionId(options);
	const sourceMetadata = [
		`Source Pi session ID: ${sessionId ?? UNAVAILABLE_SESSION_ID}`,
		`Source Pi session log: ${normalizedSessionFile ?? UNAVAILABLE_SESSION_LOG}`,
	].join("\n");

	return `Investigation sources supplied by the current Pi runtime:

${buildFencedTextBlock(sourceMetadata)}

The final Markdown handoff artifact must include a \`## Investigation Sources\` section. In that section:
- Copy the source Pi session ID and source Pi session log above exactly, including an explicit unavailable value when this runtime has no persisted session file.
- List concrete paths to other relevant files that can be inspected to understand or continue this work, especially child/subagent session logs, plans, reports, saved command output, and the key source or test files involved.
- Give a short reason each related path is useful. Do not invent paths, and say that no additional investigation files were identified when there are none.
- Store pointers only; do not paste session logs, large generated output, secrets, or credentials into the handoff.

Keep the handoff self-contained. Investigation sources are an audit and recovery trail, not a substitute for the handoff's current state, decisions, and next steps.`;
}

function normalizeSessionFile(sessionFile: string | undefined): string | undefined {
	const normalized = normalizeValue(sessionFile);
	if (normalized === undefined) return undefined;
	const basename = normalized.split(/[/\\]/).pop() ?? "";
	return basename.length === 0 ? undefined : normalized;
}

function normalizeValue(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

// The anchor PR's run-handle stamp (seam-design §4, concretized here for
// the steel thread): at submission the CLI stamps the dispatch workflow's
// run id into the anchor PR description as one marked, human-readable
// line. The jobs TUI later enumerates `dispatch/` anchor PRs and parses
// this stamp to reach Vercel's run observability. Pure and
// dependency-free so both the CLI and any workflow-side reader can import
// it without pulling in Node builtins or vendor SDKs.
import { isValidDispatchRunId } from "./validation.ts";

export { DISPATCH_RUN_ID_MAX_CHARS, isValidDispatchRunId } from "./validation.ts";

/** Marker prefix identifying the run-id stamp line in a PR description. */
export const DISPATCH_RUN_ID_STAMP_MARKER_PREFIX = "<!-- ns-dispatch:run-id:";
const DISPATCH_RUN_ID_STAMP_MARKER_SUFFIX = " -->";

/**
 * Build the single-line stamp: human-visible run id plus the machine
 * marker on the same line. Callers must validate the run id with
 * {@link isValidDispatchRunId} first.
 */
export function buildDispatchRunIdStamp(runId: string): string {
	return (
		`**Workflow run id:** \`${runId}\` ` +
		`${DISPATCH_RUN_ID_STAMP_MARKER_PREFIX}${runId}${DISPATCH_RUN_ID_STAMP_MARKER_SUFFIX}`
	);
}

/**
 * Parse the stamped run id out of an anchor PR description; `null` when no
 * valid stamp is present. The first valid marker wins.
 */
export function parseDispatchRunIdStamp(body: string | null): string | null {
	if (body === null) return null;
	let searchFrom = 0;
	for (;;) {
		const start = body.indexOf(DISPATCH_RUN_ID_STAMP_MARKER_PREFIX, searchFrom);
		if (start === -1) return null;
		const idStart = start + DISPATCH_RUN_ID_STAMP_MARKER_PREFIX.length;
		const end = body.indexOf(DISPATCH_RUN_ID_STAMP_MARKER_SUFFIX, idStart);
		if (end === -1) return null;
		const candidate = body.slice(idStart, end);
		if (isValidDispatchRunId(candidate)) return candidate;
		searchFrom = end + DISPATCH_RUN_ID_STAMP_MARKER_SUFFIX.length;
	}
}

/**
 * Compose a PR description carrying the stamp: replace an existing stamp
 * line in place, or append the stamp to the existing body. Idempotent for
 * the same run id, so a retried stamping call converges.
 */
export function composeAnchorPrDescriptionWithRunIdStamp(
	existingBody: string | null,
	runId: string,
): string {
	const stamp = buildDispatchRunIdStamp(runId);
	const body = existingBody ?? "";
	const lines = body.split("\n");
	const stampIndex = lines.findIndex((line) => line.includes(DISPATCH_RUN_ID_STAMP_MARKER_PREFIX));
	if (stampIndex !== -1) {
		const replaced = [...lines];
		replaced[stampIndex] = stamp;
		return replaced.join("\n");
	}
	if (body.trim().length === 0) return stamp;
	return `${body.replace(/\s+$/, "")}\n\n${stamp}`;
}

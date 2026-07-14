/** Maximum Vercel Workflow run-id length accepted by dispatch surfaces. */
export const DISPATCH_RUN_ID_MAX_CHARS = 256;

/** Run ids safe in the anchor PR's HTML-comment marker and inline code. */
export function isValidDispatchRunId(runId: string): boolean {
	if (runId.length < 1 || runId.length > DISPATCH_RUN_ID_MAX_CHARS) return false;
	return /^[A-Za-z0-9._:-]+$/.test(runId);
}

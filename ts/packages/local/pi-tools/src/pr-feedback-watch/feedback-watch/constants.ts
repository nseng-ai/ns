import { definePiSurfaceParity } from "@ns/pi/parity/extension";

export const PR_FEEDBACK_WATCH_COMMAND_NAME = "pr:watch-feedback";

export const prFeedbackWatchParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_FEEDBACK_WATCH_COMMAND_NAME,
		workflow:
			"Watch the current branch PR for new feedback and inject downloader-only triage prompts",
		parity: "WAIVED",
		fallback:
			"Use /pr:download-feedback or ns address exec download-feedback manually when PR feedback is detected or requested outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@internal/pi-tools/pr-feedback-watch",
		sourceModule: "pr-feedback-watch",
		notes:
			"Pi owns opt-in live polling and prompt injection; pr-address owns portable read-only feedback download and normalization.",
	},
] as const);
export const PR_FEEDBACK_WATCH_MESSAGE_TYPE = "pr-watch-feedback";
export const PR_FEEDBACK_WATCH_STATE_TYPE = "pr-watch-feedback-state";

export const DEFAULT_INTERVAL_MS = 15_000;
export const MIN_INTERVAL_MS = 10_000;
export const HEAVY_FALLBACK_INTERVAL_MS = 60_000;
export const STATUS_REFRESH_INTERVAL_MS = 1_000;
export const REST_FINGERPRINT_SKEW_MS = 2_000;
export const REST_FAILURES_BEFORE_HEAVY_FALLBACK = 3;
export const REST_FAILURE_STATUS = "PR watch: REST check failed; retrying";
export const COMMAND_TIMEOUT_MS = 30_000;
export const GIT_TIMEOUT_MS = 5_000;
export const TOP_LEVEL_BOT_DISCUSSION_AUTHORS = new Set(["vercel[bot]"]);

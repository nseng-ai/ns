export const COMMAND_NAME = "ns:flow:land";
export const STATUS_KEY = "land";
export const COMMAND_STREAM_MESSAGE_TYPE = "land-command-stream";

export const GIT_TIMEOUT_MS = 30_000;
export const GH_TIMEOUT_MS = 30_000;
export const GH_MERGE_TIMEOUT_MS = 120_000;
export const GT_TIMEOUT_MS = 120_000;
export const GT_MUTATION_TIMEOUT_MS = 600_000;
export const SLOT_TIMEOUT_MS = 120_000;
export const SQLITE_TIMEOUT_MS = 30_000;

// Transitional compatibility exports; backup vocabulary is owned by land core.
export { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE } from "../graphite-operations.ts";
export const PR_FIELD_NAMES = [
	"id",
	"number",
	"title",
	"body",
	"state",
	"isDraft",
	"headRefName",
	"baseRefName",
	"headRefOid",
	"mergeStateStatus",
	"url",
	"mergedAt",
] as const;
export const PR_FIELDS = PR_FIELD_NAMES.join(",");

export const MAX_OUTPUT_TAIL_LINES = 40;
export const MAX_OUTPUT_TAIL_CHARS = 4_000;
export const MAX_COMMAND_STREAM_OUTPUT_LINES = 4;

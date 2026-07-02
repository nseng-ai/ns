export const COMMAND_NAME = "sdl:flow:land";
export const STATUS_KEY = "land";
export const COMMAND_STREAM_MESSAGE_TYPE = "land-command-stream";

export const GIT_TIMEOUT_MS = 30_000;
export const GH_TIMEOUT_MS = 30_000;
export const GH_MERGE_TIMEOUT_MS = 120_000;
export const GT_TIMEOUT_MS = 120_000;
export const GT_MUTATION_TIMEOUT_MS = 600_000;
export const SLOT_TIMEOUT_MS = 120_000;
export const SQLITE_TIMEOUT_MS = 30_000;

export const BACKUP_REF_NAMESPACE = "refs/sdl/flow-land-backup";
export const BACKUP_REF_PREV_NAMESPACE = "refs/sdl/flow-land-backup-prev";
export const PR_FIELDS =
	"number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt";

export const MAX_OUTPUT_TAIL_LINES = 40;
export const MAX_OUTPUT_TAIL_CHARS = 4_000;
export const MAX_COMMAND_STREAM_OUTPUT_LINES = 4;

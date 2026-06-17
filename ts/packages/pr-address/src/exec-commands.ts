import type { ExecOperation } from "./exec-operation.ts";

import { downloadFeedbackOperation } from "./download-feedback.ts";
import { mapBranchPrsOperation } from "./map-branch-prs.ts";

/** The downloader-only exec operation table. */
export const EXEC_OPERATIONS: readonly ExecOperation[] = [downloadFeedbackOperation, mapBranchPrsOperation];

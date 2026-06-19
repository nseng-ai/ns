import type { ExecOperation } from "./exec-operation.ts";

import { downloadFeedbackOperation } from "./download-feedback.ts";
import { mapBranchPrsOperation } from "./map-branch-prs.ts";
import { primitiveOperations } from "./primitive-commands.ts";

/** Exec operation table for downloader workflows and shared PR feedback primitives. */
export const EXEC_OPERATIONS: readonly ExecOperation[] = [
	downloadFeedbackOperation,
	mapBranchPrsOperation,
	...primitiveOperations,
];

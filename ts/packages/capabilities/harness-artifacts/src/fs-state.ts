/**
 * Filesystem inspection states shared by harness-artifact convention checks.
 *
 * Moved from `@nseng-ai/areg` (`AregPathState` / `AregTextFileState`) so the
 * harness-artifact subsystem and areg speak one vocabulary for "what is at
 * this path".
 */

export type PathState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" };

export type TextFileState =
	| { type: "missing" }
	| { type: "file"; text: string }
	| { type: "directory" }
	| { type: "symlink"; target: string }
	| { type: "other" }
	| { type: "unreadable"; message: string };

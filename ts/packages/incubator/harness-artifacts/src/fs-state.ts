/**
 * Filesystem inspection states shared by harness-artifact convention checks
 * and project-local harness-overlay management.
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

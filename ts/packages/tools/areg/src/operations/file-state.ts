import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, type Result } from "@nseng-ai/foundation/result";

import type { PathState, TextFileState } from "@nseng-ai/harness-artifacts/api";

type NonUsableTextFileState = Exclude<TextFileState, { type: "file" } | { type: "missing" }>;
type NonUsableDirectoryState = Exclude<PathState, { type: "directory" } | { type: "missing" }>;

export function isPathStateError(error: { code: string }): boolean {
	return (
		error.code === "path_symlink" ||
		error.code === "path_not_file" ||
		error.code === "path_not_directory"
	);
}

export function validateOptionalDirectoryState(options: {
	pathLabel: string;
	state: PathState;
	action: string;
	symlinkSubject?: string;
}): Result<undefined> {
	if (options.state.type === "missing" || options.state.type === "directory")
		return { ok: true, value: undefined };
	return rejectDirectoryState({
		pathLabel: options.pathLabel,
		state: options.state,
		action: options.action,
		...optionalEntry("symlinkSubject", options.symlinkSubject),
	});
}

export function rejectTextState<T>(options: {
	pathLabel: string;
	state: NonUsableTextFileState;
	action: string;
	description?: string;
	unreadableMode?: "failed-read" | "not-file";
}): Result<T> {
	if (options.state.type === "symlink") {
		const subject =
			options.description === undefined
				? options.pathLabel
				: `${options.description} at ${options.pathLabel}`;
		return resultErr({
			code: "path_symlink",
			message: `${subject} is a symlink; refusing to ${options.action}.`,
		});
	}
	if (options.state.type === "unreadable" && options.unreadableMode !== "not-file") {
		return resultErr({
			code: "path_read_failed",
			message: `Failed to read ${options.pathLabel}: ${options.state.message}`,
		});
	}
	return resultErr({
		code: "path_not_file",
		message: `${options.pathLabel} exists but is not a file.`,
	});
}

function rejectDirectoryState<T>(options: {
	pathLabel: string;
	state: NonUsableDirectoryState;
	action: string;
	symlinkSubject?: string;
}): Result<T> {
	if (options.state.type === "symlink")
		return resultErr({
			code: "path_symlink",
			message: `${options.symlinkSubject ?? options.pathLabel} is a symlink; refusing to ${options.action}.`,
		});
	return resultErr({
		code: "path_not_directory",
		message: `${options.pathLabel} exists but is not a directory.`,
	});
}

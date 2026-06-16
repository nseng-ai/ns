import type { Result } from "@asdl/core/result";

import type { AregPathState, AregTextFileState } from "../gateways.ts";

type NonUsableTextFileState = Exclude<AregTextFileState, { type: "file" } | { type: "missing" }>;
type NonUsableDirectoryState = Exclude<AregPathState, { type: "directory" } | { type: "missing" }>;

export function validateOptionalDirectoryState(options: {
	pathLabel: string;
	state: AregPathState;
	action: string;
	symlinkSubject?: string | undefined;
}): Result<undefined> {
	if (options.state.type === "missing" || options.state.type === "directory") return { ok: true, value: undefined };
	return rejectDirectoryState({
		pathLabel: options.pathLabel,
		state: options.state,
		action: options.action,
		symlinkSubject: options.symlinkSubject,
	});
}

export function rejectTextState<T>(options: {
	pathLabel: string;
	state: NonUsableTextFileState;
	action: string;
	description?: string | undefined;
	unreadableMode?: "failed-read" | "not-file" | undefined;
}): Result<T> {
	if (options.state.type === "symlink") {
		const subject = options.description === undefined ? options.pathLabel : `${options.description} at ${options.pathLabel}`;
		return { ok: false, error: { code: "path_symlink", message: `${subject} is a symlink; refusing to ${options.action}.` } };
	}
	if (options.state.type === "unreadable" && options.unreadableMode !== "not-file") {
		return { ok: false, error: { code: "path_read_failed", message: `Failed to read ${options.pathLabel}: ${options.state.message}` } };
	}
	return { ok: false, error: { code: "path_not_file", message: `${options.pathLabel} exists but is not a file.` } };
}

function rejectDirectoryState<T>(options: {
	pathLabel: string;
	state: NonUsableDirectoryState;
	action: string;
	symlinkSubject?: string | undefined;
}): Result<T> {
	if (options.state.type === "symlink") return { ok: false, error: { code: "path_symlink", message: `${options.symlinkSubject ?? options.pathLabel} is a symlink; refusing to ${options.action}.` } };
	return { ok: false, error: { code: "path_not_directory", message: `${options.pathLabel} exists but is not a directory.` } };
}

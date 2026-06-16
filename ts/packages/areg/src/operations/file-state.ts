import type { AregPathState, AregTextFileState } from "../gateways.ts";

type PlanResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

type NonUsableTextFileState = Exclude<AregTextFileState, { type: "file" } | { type: "missing" }>;
type NonUsableDirectoryState = Exclude<AregPathState, { type: "directory" } | { type: "missing" }>;

export function validateOptionalDirectoryState(options: {
	pathLabel: string;
	state: AregPathState;
	action: string;
	symlinkSubject?: string | undefined;
}): PlanResult<undefined> {
	if (options.state.type === "missing" || options.state.type === "directory") return { type: "ok", value: undefined };
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
}): PlanResult<T> {
	if (options.state.type === "symlink") {
		const subject = options.description === undefined ? options.pathLabel : `${options.description} at ${options.pathLabel}`;
		return { type: "error", message: `${subject} is a symlink; refusing to ${options.action}.` };
	}
	if (options.state.type === "unreadable" && options.unreadableMode !== "not-file") {
		return { type: "error", message: `Failed to read ${options.pathLabel}: ${options.state.message}` };
	}
	return { type: "error", message: `${options.pathLabel} exists but is not a file.` };
}

function rejectDirectoryState<T>(options: {
	pathLabel: string;
	state: NonUsableDirectoryState;
	action: string;
	symlinkSubject?: string | undefined;
}): PlanResult<T> {
	if (options.state.type === "symlink") return { type: "error", message: `${options.symlinkSubject ?? options.pathLabel} is a symlink; refusing to ${options.action}.` };
	return { type: "error", message: `${options.pathLabel} exists but is not a directory.` };
}

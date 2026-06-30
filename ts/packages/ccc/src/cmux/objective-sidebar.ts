import { basename, isAbsolute, posix, relative, resolve, sep } from "node:path";

import { type ExecResult, formatCommand, formatOutputSection, tailText } from "@sdl/core/command";
import { parseMachineEnvelopeData } from "@sdl/core/machine-envelope";
import { formatErrorMessage } from "@sdl/core/primitives";
import type { ExtensionAPI } from "@sdl/cmux/types";

const OBJECTIVE_READ_TIMEOUT_MS = 30_000;
export const CMUX_WORKSPACE_SUMMARY_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 20;
const ACTIVE_OBJECTIVE_PREFIX = ".sdl/objectives/";
const ACTIVE_OBJECTIVE_ROOT = ".sdl/objectives";
const ARCHIVE_OBJECTIVE_ROOT = ".sdl/objective-archive";

export type ObjectiveSelectorParseResult =
	| {
			type: "valid";
			slug: string;
	  }
	| {
			type: "invalid";
			message: string;
	  };

export interface ObjectiveSidebarFormatInput {
	objectiveSlug: string;
	slotSlug: string;
	branchSlug: string;
}

export interface SidebarFields {
	title: string;
	description: string;
}

export type ObjectiveSidebarValidationResult =
	| {
			type: "validated";
	  }
	| {
			type: "failed";
			message: string;
	  };

export type ObjectiveSidebarApplyResult =
	| {
			type: "applied";
	  }
	| {
			type: "failed";
			message: string;
	  };

export type BranchSlugReadResult =
	| {
			type: "loaded";
			branchSlug: string;
	  }
	| {
			type: "failed";
			message: string;
	  };

export function resolveObjectiveSelector(
	selector: string,
	cwd: string,
): ObjectiveSelectorParseResult {
	const trimmed = selector.trim();
	if (trimmed.length === 0) {
		return invalidSelector("Pass an Objective slug or .sdl/objectives/<slug> path.");
	}

	if (trimmed.includes("\\")) {
		return invalidSelector(
			"Objective selector must be a slug or a .sdl/objectives/<slug> path using forward slashes.",
		);
	}

	if (isAbsolute(trimmed)) {
		return resolveAbsoluteObjectiveSelector(trimmed, cwd);
	}

	if (!trimmed.includes("/")) {
		return validSlugSelector(trimmed);
	}

	return resolveRepoRelativeObjectiveSelector(trimmed);
}

export async function validateObjectiveSidebarSlug(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	slug: string,
): Promise<ObjectiveSidebarValidationResult> {
	const args = ["objective", "exec", "read-objective", slug, "--format", "json"];
	let result: ExecResult;
	try {
		result = await pi.exec("sdl", args, { cwd, timeout: OBJECTIVE_READ_TIMEOUT_MS });
	} catch (error) {
		return {
			type: "failed",
			message: formatStartupFailure("Could not read Objective.", "sdl", args, error),
		};
	}

	const commandDisplay = formatCommand("sdl", args);
	if (result.killed || result.code !== 0) {
		return {
			type: "failed",
			message: formatFailedEnvelopeOrExecFailure(
				"Could not read Objective.",
				commandDisplay,
				result,
				"objective read JSON",
			),
		};
	}

	const parsed = parseMachineEnvelopeData(result.stdout, {
		label: "objective read JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
	});
	if (parsed.type !== "valid") {
		return { type: "failed", message: parsed.message };
	}

	return parseObjectiveSidebarValidation(parsed.data, slug);
}

export async function readCurrentBranchSlug(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
): Promise<BranchSlugReadResult> {
	const args = ["branch", "--show-current"];
	let result: ExecResult;
	try {
		result = await pi.exec("git", args, { cwd, timeout: OBJECTIVE_READ_TIMEOUT_MS });
	} catch (error) {
		return {
			type: "failed",
			message: formatStartupFailure(
				"Could not read current branch for cmux Objective sidebar.",
				"git",
				args,
				error,
			),
		};
	}

	const commandDisplay = formatCommand("git", args);
	if (result.killed || result.code !== 0) {
		return {
			type: "failed",
			message: formatExecFailure(
				"Could not read current branch for cmux Objective sidebar.",
				commandDisplay,
				result,
			),
		};
	}

	const branchSlug = result.stdout.trim();
	if (branchSlug.length === 0) {
		return {
			type: "failed",
			message:
				"Could not read current branch for cmux Objective sidebar: detached HEAD or blank branch name.",
		};
	}

	return { type: "loaded", branchSlug };
}

export function slotSlugFromCwd(cwd: string): string {
	return basename(resolve(cwd));
}

export function formatObjectiveSidebarFields(input: ObjectiveSidebarFormatInput): SidebarFields {
	return {
		title: `obj:${input.objectiveSlug}`,
		description: `${input.slotSlug}::${input.branchSlug}`,
	};
}

export async function applyObjectiveSidebarFields(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	fields: SidebarFields,
): Promise<ObjectiveSidebarApplyResult> {
	const args = [
		"exec",
		"cmux-workspace-summary",
		"--title",
		fields.title,
		"--description",
		fields.description,
		"--format",
		"json",
	];
	let result: ExecResult;
	try {
		result = await pi.exec("ccc", args, { cwd, timeout: CMUX_WORKSPACE_SUMMARY_TIMEOUT_MS });
	} catch (error) {
		return {
			type: "failed",
			message: formatStartupFailure("Could not apply cmux Objective sidebar.", "ccc", args, error),
		};
	}

	const commandDisplay = formatCommand("ccc", args);
	if (result.killed || result.code !== 0) {
		return {
			type: "failed",
			message: formatFailedEnvelopeOrExecFailure(
				"Could not apply cmux Objective sidebar.",
				commandDisplay,
				result,
				"cmux workspace summary JSON",
			),
		};
	}

	const parsed = parseMachineEnvelopeData(result.stdout, {
		label: "cmux workspace summary JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
	});
	if (parsed.type !== "valid") {
		return { type: "failed", message: parsed.message };
	}

	if (parsed.data.success !== true) {
		return {
			type: "failed",
			message: "Invalid cmux workspace summary JSON: expected data.success true.",
		};
	}

	return { type: "applied" };
}

function resolveAbsoluteObjectiveSelector(
	selector: string,
	cwd: string,
): ObjectiveSelectorParseResult {
	const normalizedSelector = resolve(selector);
	const activeRoot = resolve(cwd, ACTIVE_OBJECTIVE_ROOT);
	const relativePath = relative(activeRoot, normalizedSelector);
	if (relativePath.length === 0) {
		return invalidSelector("Pass an Objective slug or path below .sdl/objectives/<slug>.");
	}
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return invalidSelector(
			"Objective path must be inside the current repo's .sdl/objectives directory.",
		);
	}

	const slug = relativePath.split(sep)[0];
	return validSlugSelector(slug ?? "");
}

function resolveRepoRelativeObjectiveSelector(selector: string): ObjectiveSelectorParseResult {
	const normalized = posix.normalize(selector);
	if (
		normalized === ARCHIVE_OBJECTIVE_ROOT ||
		normalized.startsWith(`${ARCHIVE_OBJECTIVE_ROOT}/`)
	) {
		return invalidSelector(
			"Archived Objective paths are not supported; pass an active .sdl/objectives/<slug> path.",
		);
	}
	if (normalized === ACTIVE_OBJECTIVE_ROOT) {
		return invalidSelector("Pass an Objective slug or path below .sdl/objectives/<slug>.");
	}
	if (!normalized.startsWith(ACTIVE_OBJECTIVE_PREFIX)) {
		return invalidSelector("Pass an Objective slug or .sdl/objectives/<slug> path.");
	}

	const relativePath = normalized.slice(ACTIVE_OBJECTIVE_PREFIX.length);
	const slug = relativePath.split("/")[0] ?? "";
	return validSlugSelector(slug);
}

function validSlugSelector(slug: string): ObjectiveSelectorParseResult {
	if (!isValidObjectiveSlug(slug)) {
		return invalidSelector(
			"Objective selector must be a single slug, not '.', '..', or a nested path.",
		);
	}
	return { type: "valid", slug };
}

function invalidSelector(message: string): ObjectiveSelectorParseResult {
	return { type: "invalid", message };
}

function isValidObjectiveSlug(slug: string): boolean {
	return (
		slug.length > 0 && slug !== "." && slug !== ".." && !slug.includes("/") && !slug.includes("\\")
	);
}

function parseObjectiveSidebarValidation(
	data: Record<string, unknown>,
	expectedSlug: string,
): ObjectiveSidebarValidationResult {
	if (data.status !== "ok" || data.slug !== expectedSlug) {
		return {
			type: "failed",
			message: "Invalid objective read JSON: expected status ok and matching slug.",
		};
	}

	return { type: "validated" };
}

function formatStartupFailure(
	summary: string,
	command: string,
	args: readonly string[],
	error: unknown,
): string {
	return tailText(
		`${summary}\nCommand: ${formatCommand(command, args)}\nError: ${formatErrorMessage(error)}`,
		{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
	);
}

function formatFailedEnvelopeOrExecFailure(
	summary: string,
	commandDisplay: string,
	result: ExecResult,
	label: string,
): string {
	if (result.stdout.trim().length > 0) {
		const parsed = parseMachineEnvelopeData(result.stdout, {
			label,
			stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
		});
		if (parsed.type !== "valid") {
			return `${summary}\nCommand: ${commandDisplay}\n${parsed.message}`;
		}
	}
	return formatExecFailure(summary, commandDisplay, result);
}

function formatExecFailure(summary: string, commandDisplay: string, result: ExecResult): string {
	const lines = [
		summary,
		`Command: ${commandDisplay}`,
		`Exit code: ${result.code}`,
		`Killed: ${result.killed ? "yes" : "no"}`,
		formatOutputSection("stdout", result.stdout, {
			maxChars: MAX_ERROR_CHARS,
			maxLines: MAX_ERROR_LINES,
		}),
		formatOutputSection("stderr", result.stderr, {
			maxChars: MAX_ERROR_CHARS,
			maxLines: MAX_ERROR_LINES,
		}),
	];
	return tailText(lines.join("\n"), { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES });
}

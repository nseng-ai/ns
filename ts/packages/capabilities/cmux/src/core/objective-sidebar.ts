import { basename, isAbsolute, posix, relative, resolve, sep } from "node:path";

import { runJsonExecCommand } from "@nseng-ai/capability-kit/machine-envelope-exec";
import {
	commandSucceeded,
	type CommandExecApi,
	type ExecResult,
	formatCommand,
	formatCommandFailure,
	tailText,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

const OBJECTIVE_READ_TIMEOUT_MS = 30_000;
export const CMUX_WORKSPACE_SUMMARY_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 20;
const ACTIVE_OBJECTIVE_PREFIX = ".ns/objectives/";
const ACTIVE_OBJECTIVE_ROOT = ".ns/objectives";

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
		return invalidSelector("Pass an Objective slug or .ns/objectives/<slug> path.");
	}

	if (trimmed.includes("\\")) {
		return invalidSelector(
			"Objective selector must be a slug or a .ns/objectives/<slug> path using forward slashes.",
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
	pi: CommandExecApi,
	cwd: string,
	slug: string,
): Promise<ObjectiveSidebarValidationResult> {
	const parsed = await runJsonExecCommand({
		pi,
		cwd,
		command: "ns",
		args: ["objective", "exec", "read-objective", slug, "--format", "json"],
		timeoutMs: OBJECTIVE_READ_TIMEOUT_MS,
		summary: "Could not read Objective.",
		label: "objective read JSON",
	});
	if (parsed.type === "failed") return parsed;

	return parseObjectiveSidebarValidation(parsed.data, slug);
}

export async function readCurrentBranchSlug(
	pi: CommandExecApi,
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
	if (!commandSucceeded(result)) {
		return {
			type: "failed",
			message: formatCommandFailure(
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
	pi: CommandExecApi,
	cwd: string,
	fields: SidebarFields,
): Promise<ObjectiveSidebarApplyResult> {
	const parsed = await runJsonExecCommand({
		pi,
		cwd,
		command: "ns",
		args: [
			"cmux",
			"exec",
			"workspace-summary",
			"--title",
			fields.title,
			"--description",
			fields.description,
			"--format",
			"json",
		],
		timeoutMs: CMUX_WORKSPACE_SUMMARY_TIMEOUT_MS,
		summary: "Could not apply cmux Objective sidebar.",
		label: "cmux workspace summary JSON",
	});
	if (parsed.type === "failed") return parsed;

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
		return invalidSelector("Pass an Objective slug or path below .ns/objectives/<slug>.");
	}
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return invalidSelector(
			"Objective path must be inside the current repo's .ns/objectives directory.",
		);
	}

	const slug = relativePath.split(sep)[0];
	return validSlugSelector(slug ?? "");
}

function resolveRepoRelativeObjectiveSelector(selector: string): ObjectiveSelectorParseResult {
	const normalized = posix.normalize(selector);
	if (normalized === ACTIVE_OBJECTIVE_ROOT) {
		return invalidSelector("Pass an Objective slug or path below .ns/objectives/<slug>.");
	}
	if (!normalized.startsWith(ACTIVE_OBJECTIVE_PREFIX)) {
		return invalidSelector("Pass an Objective slug or .ns/objectives/<slug> path.");
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

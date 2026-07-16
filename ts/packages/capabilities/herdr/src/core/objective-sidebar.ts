import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { runJsonExecCommand } from "@nseng-ai/capability-kit/machine-envelope-exec";
import type { CommandExecApi } from "@nseng-ai/foundation/command";

const OBJECTIVE_READ_TIMEOUT_MS = 30_000;
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
}

export type ObjectiveSidebarValidationResult =
	| {
			type: "validated";
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

/**
 * Format the workspace label that will be applied via `herdr workspace rename`.
 *
 * Only the Objective slug is encoded in the workspace label. The caller-pane
 * title carries the slot separately; branch metadata remains omitted.
 */
export function formatObjectiveSidebarLabel(input: ObjectiveSidebarFormatInput): string {
	return `obj:${input.objectiveSlug}`;
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

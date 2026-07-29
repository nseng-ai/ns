import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { runJsonExecCommand } from "@nseng-ai/extension-kit/machine-envelope-exec";
import { formatHerdrResourceLabel } from "@nseng-ai/herdr/api";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

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
	slotSlug?: string;
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
		return invalidSelector(
			"Pass an Objective locator, slug, or .ns/objectives/<owner>/<slug> path.",
		);
	}

	if (trimmed.includes("\\")) {
		return invalidSelector(
			"Objective selector must be a locator, slug, or .ns/objectives/<owner>/<slug> path using forward slashes.",
		);
	}

	if (isAbsolute(trimmed)) {
		return resolveAbsoluteObjectiveSelector(trimmed, cwd);
	}

	if (!trimmed.includes("/")) {
		return validSlugSelector(trimmed);
	}

	if (!trimmed.startsWith(".") && !trimmed.startsWith("/")) {
		const segments = trimmed.split("/");
		if (segments.length === 2) {
			return validLocatorSelector(segments[0] ?? "", segments[1] ?? "");
		}
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
 * A compact slot prefix is included only when the caller is running in a
 * managed ns slot. Keep this formatter narrow for now: resource-label
 * composition should eventually become a Herdr workflow pluggability point
 * rather than accumulating more hard-coded consumer policy here.
 */
export function formatObjectiveSidebarLabel(input: ObjectiveSidebarFormatInput): string {
	return formatHerdrResourceLabel({
		semanticLabel: `obj:${input.objectiveSlug}`,
		...optionalEntry("slotSlug", input.slotSlug),
	});
}

function resolveAbsoluteObjectiveSelector(
	selector: string,
	cwd: string,
): ObjectiveSelectorParseResult {
	const normalizedSelector = resolve(selector);
	const activeRoot = resolve(cwd, ACTIVE_OBJECTIVE_ROOT);
	const relativePath = relative(activeRoot, normalizedSelector);
	if (relativePath.length === 0) {
		return invalidSelector(
			"Pass an Objective locator, slug, or path below .ns/objectives/<owner>/<slug>.",
		);
	}
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return invalidSelector(
			"Objective path must be inside the current repo's .ns/objectives directory.",
		);
	}

	const segments = relativePath.split(sep);
	return objectiveSelectorFromPathSegments(segments);
}

function resolveRepoRelativeObjectiveSelector(selector: string): ObjectiveSelectorParseResult {
	const normalized = posix.normalize(selector);
	if (normalized === ACTIVE_OBJECTIVE_ROOT) {
		return invalidSelector(
			"Pass an Objective locator, slug, or path below .ns/objectives/<owner>/<slug>.",
		);
	}
	if (!normalized.startsWith(ACTIVE_OBJECTIVE_PREFIX)) {
		return invalidSelector(
			"Pass an Objective locator, slug, or .ns/objectives/<owner>/<slug> path.",
		);
	}

	const relativePath = normalized.slice(ACTIVE_OBJECTIVE_PREFIX.length);
	return objectiveSelectorFromPathSegments(relativePath.split("/"));
}

const RECORD_ENTRY_NAMES = new Set([
	"objective.md",
	"roadmap.md",
	"closed.md",
	"orientation.md",
	"updates",
	"references",
]);

/**
 * Selector from path segments below the Active Objective Root: canonical
 * owner-nested paths (`<owner>/<slug>/...`) normalize to a full locator. A
 * single-segment path, or a legacy flat record path whose second segment is a
 * record entry (for example `objective.md` or `updates`), stays an owner-local
 * slug selector resolved downstream.
 */
function objectiveSelectorFromPathSegments(
	segments: readonly string[],
): ObjectiveSelectorParseResult {
	const [first, second] = segments;
	if (
		first !== undefined &&
		second !== undefined &&
		!RECORD_ENTRY_NAMES.has(second) &&
		!second.endsWith(".md")
	) {
		return validLocatorSelector(first, second);
	}
	return validSlugSelector(first ?? "");
}

function validSlugSelector(slug: string): ObjectiveSelectorParseResult {
	if (!isValidObjectiveSlug(slug)) {
		return invalidSelector(
			"Objective selector must be a slug, an <owner>/<slug> locator, or a .ns/objectives path.",
		);
	}
	return { type: "valid", slug };
}

function validLocatorSelector(owner: string, slug: string): ObjectiveSelectorParseResult {
	if (!isValidObjectiveSlug(owner) || !isValidObjectiveSlug(slug)) {
		return invalidSelector(
			"Objective selector must be a slug, an <owner>/<slug> locator, or a .ns/objectives path.",
		);
	}
	return { type: "valid", slug: `${owner}/${slug}` };
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
	const resolvedIdentity = expectedSlug.includes("/") ? data.locator : data.slug;
	if (data.status !== "ok" || resolvedIdentity !== expectedSlug) {
		return {
			type: "failed",
			message: "Invalid objective read JSON: expected status ok and matching slug.",
		};
	}

	return { type: "validated" };
}

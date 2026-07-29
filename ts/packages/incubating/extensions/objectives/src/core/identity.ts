/**
 * Objective identity domain values: Objective Owner, Objective Slug, and the
 * durable Objective Locator `<owner>/<slug>`. Owner validation is local and
 * deterministic (GitHub-compatible handle syntax); no network verification
 * happens here. Durable records, edges, machine output, and scripts always
 * use full locators.
 */

export const OBJECTIVE_OWNER_MAX_LENGTH = 39;

/**
 * Canonical bare owner handle: lowercase ASCII alphanumerics with single
 * internal hyphens, no leading/trailing `-`, no leading `@`, at most 39
 * characters. Consecutive hyphens are rejected.
 */
const OBJECTIVE_OWNER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isValidObjectiveOwner(owner: string): boolean {
	return (
		owner.length > 0 &&
		owner.length <= OBJECTIVE_OWNER_MAX_LENGTH &&
		OBJECTIVE_OWNER_PATTERN.test(owner)
	);
}

/** Owner-local record name: path-safe and single-segment. */
export function isValidObjectiveSlug(slug: string): boolean {
	return (
		slug !== "" && slug !== "." && slug !== ".." && !slug.includes("/") && !slug.includes("\\")
	);
}

/** The durable Objective identity: `<owner>/<slug>`. */
export interface ObjectiveLocator {
	owner: string;
	slug: string;
}

export function renderObjectiveLocator(locator: ObjectiveLocator): string {
	return `${locator.owner}/${locator.slug}`;
}

export function objectiveLocatorEquals(left: ObjectiveLocator, right: ObjectiveLocator): boolean {
	return left.owner === right.owner && left.slug === right.slug;
}

export function isValidObjectiveLocator(locator: ObjectiveLocator): boolean {
	return isValidObjectiveOwner(locator.owner) && isValidObjectiveSlug(locator.slug);
}

export type ObjectiveSelectorParse =
	/** A full `<owner>/<slug>` locator with valid owner and slug segments. */
	| { type: "locator"; locator: ObjectiveLocator }
	/** A bare owner-local slug; the caller must fix the owner namespace before lookup. */
	| { type: "bare-slug"; slug: string }
	| { type: "invalid"; message: string };

/**
 * Parse user-facing Objective selection input. A full locator contains exactly
 * one `/` separating a valid owner and a valid slug; anything without `/` is a
 * bare slug resolved only inside the current owner's namespace.
 */
export function parseObjectiveSelector(input: string): ObjectiveSelectorParse {
	if (input.includes("/")) {
		const segments = input.split("/");
		if (segments.length !== 2) {
			return {
				type: "invalid",
				message: `Objective locator must be <owner>/<slug> with exactly one "/": ${JSON.stringify(input)}.`,
			};
		}
		const [owner = "", slug = ""] = segments;
		if (!isValidObjectiveOwner(owner)) {
			return {
				type: "invalid",
				message: `Invalid Objective owner ${JSON.stringify(owner)} in locator ${JSON.stringify(input)}.`,
			};
		}
		if (!isValidObjectiveSlug(slug)) {
			return {
				type: "invalid",
				message: `Invalid Objective slug ${JSON.stringify(slug)} in locator ${JSON.stringify(input)}.`,
			};
		}
		return { type: "locator", locator: { owner, slug } };
	}
	if (!isValidObjectiveSlug(input)) {
		return { type: "invalid", message: `Invalid Objective slug ${JSON.stringify(input)}.` };
	}
	return { type: "bare-slug", slug: input };
}

/**
 * Parse a durable locator string (for example an edge endpoint) that must be a
 * full `<owner>/<slug>` locator; bare slugs are rejected.
 */
export function parseObjectiveLocatorString(input: string): ObjectiveLocator | null {
	const parsed = parseObjectiveSelector(input);
	if (parsed.type !== "locator") return null;
	return parsed.locator;
}

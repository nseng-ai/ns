import { brmemError, brmemOk, validateEntryKey, type BrmemResult } from "@nseng-ai/brmem";

export const HANDOFF_NAMESPACE = "handoff";
export const HANDOFF_KEY_SUFFIX = ".md";

const FLAT_HANDOFF_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type FlatHandoffSlugParseResult =
	| { type: "valid"; slug: string }
	| { type: "invalid"; message: string };

export type HandoffSlugNormalizationResult =
	| { type: "valid"; slug: string; requestedSlug: string; changed: boolean }
	| { type: "invalid"; message: string };

function kebabNormalizeSlugText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function deriveSemanticHandoffSlug(focus: string): string | undefined {
	const slug = kebabNormalizeSlugText(focus);
	if (slug.length === 0) {
		return undefined;
	}
	return slug.split("-").slice(0, 8).join("-");
}

/**
 * Normalize a human-given handoff name into a valid flat handoff slug using the
 * deterministic scheme the handoff-create skill documents: lowercase, runs of
 * non-alphanumerics become single dashes, leading/trailing dashes are trimmed,
 * and a trailing `.md` key suffix is dropped before normalizing. Idempotent on
 * already-valid slugs.
 */
export function normalizeHandoffSlugInput(value: string): HandoffSlugNormalizationResult {
	const requestedSlug = value.trim();
	if (requestedSlug.length === 0) {
		return { type: "invalid", message: "handoff slug must be non-empty." };
	}
	const withoutKeySuffix = requestedSlug.toLowerCase().endsWith(HANDOFF_KEY_SUFFIX)
		? requestedSlug.slice(0, -HANDOFF_KEY_SUFFIX.length)
		: requestedSlug;
	const slug = kebabNormalizeSlugText(withoutKeySuffix);
	if (slug.length === 0) {
		return {
			type: "invalid",
			message: `handoff slug ${JSON.stringify(value)} normalizes to an empty slug; include at least one letter or number.`,
		};
	}
	return { type: "valid", slug, requestedSlug, changed: slug !== requestedSlug };
}

export function parseFlatHandoffSlug(
	value: string,
	label = "handoff slug",
): FlatHandoffSlugParseResult {
	const slug = value.trim();
	if (slug.length === 0) {
		return { type: "invalid", message: `${label} must be non-empty.` };
	}
	if (slug !== value) {
		return {
			type: "invalid",
			message: `${label} must not include leading or trailing whitespace.`,
		};
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX)) {
		return { type: "invalid", message: `${label} must not include ${HANDOFF_KEY_SUFFIX}.` };
	}
	if (slug.includes("/")) {
		return { type: "invalid", message: `${label} must be flat and must not contain '/'.` };
	}
	if (!FLAT_HANDOFF_SLUG_PATTERN.test(slug)) {
		return {
			type: "invalid",
			message: `${label} must use lowercase letters, numbers, and single interior dashes only.`,
		};
	}
	return { type: "valid", slug };
}

export function handoffSlugToKey(slug: string): string {
	return `${slug}${HANDOFF_KEY_SUFFIX}`;
}

export function handoffKeyToSlug(key: string): string {
	return key.slice(0, -HANDOFF_KEY_SUFFIX.length);
}

export function handoffSlugFromKey(key: string): string {
	return handoffKeyToSlug(key);
}

export function isHandoffKey(key: string): boolean {
	if (!key.endsWith(HANDOFF_KEY_SUFFIX)) return false;
	if (key.includes("/")) return false;
	if (key.length <= HANDOFF_KEY_SUFFIX.length) return false;
	return parseFlatHandoffSlug(handoffKeyToSlug(key)).type === "valid";
}

export function handoffKeyFromSlug(slug: string): BrmemResult<string> {
	const parsed = parseFlatHandoffSlug(slug);
	if (parsed.type === "invalid") {
		return brmemError("invalid-handoff-slug", parsed.message);
	}

	const key = handoffSlugToKey(parsed.slug);
	const validation = validateEntryKey(key);
	if (validation.type === "invalid") {
		return brmemError(
			"invalid-handoff-slug",
			`Invalid key ${JSON.stringify(key)}: ${validation.reason}`,
		);
	}
	return brmemOk(key);
}

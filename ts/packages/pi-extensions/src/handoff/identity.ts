export const HANDOFF_NAMESPACE = "handoffs";
export const HANDOFF_KEY_SUFFIX = ".md";

const FLAT_HANDOFF_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type FlatHandoffSlugParseResult = { type: "valid"; slug: string } | { type: "invalid"; message: string };

export function deriveSemanticHandoffSlug(focus: string): string | undefined {
	const slug = focus
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (slug.length === 0) {
		return undefined;
	}
	return slug.split("-").slice(0, 8).join("-");
}

export function parseFlatHandoffSlug(value: string, label = "handoff slug"): FlatHandoffSlugParseResult {
	const slug = value.trim();
	if (slug.length === 0) {
		return { type: "invalid", message: `${label} must be non-empty.` };
	}
	if (slug !== value) {
		return { type: "invalid", message: `${label} must not include leading or trailing whitespace.` };
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX)) {
		return { type: "invalid", message: `${label} must not include ${HANDOFF_KEY_SUFFIX}.` };
	}
	if (slug.includes("/")) {
		return { type: "invalid", message: `${label} must be flat and must not contain '/'.` };
	}
	if (!FLAT_HANDOFF_SLUG_PATTERN.test(slug)) {
		return { type: "invalid", message: `${label} must use lowercase letters, numbers, and single interior dashes only.` };
	}
	return { type: "valid", slug };
}

export function handoffSlugToKey(slug: string): string {
	return `${slug}${HANDOFF_KEY_SUFFIX}`;
}

export function handoffKeyToSlug(key: string): string {
	return key.slice(0, -HANDOFF_KEY_SUFFIX.length);
}

export function isHandoffKey(key: string): boolean {
	if (!key.endsWith(HANDOFF_KEY_SUFFIX) || key.length <= HANDOFF_KEY_SUFFIX.length || key.includes("/")) {
		return false;
	}
	return parseFlatHandoffSlug(handoffKeyToSlug(key)).type === "valid";
}

export function formatPickupHandoffCommand(branch: string, slug: string): string {
	return `/handoff:pickup --branch ${branch} ${slug}`;
}

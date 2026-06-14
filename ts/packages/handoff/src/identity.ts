import { brmemError, brmemOk, validateEntryKey, type BrmemResult } from "@asdl/brmem";

export const HANDOFF_NAMESPACE = "handoff";
export const HANDOFF_KEY_SUFFIX = ".md";

export function isHandoffKey(key: string): boolean {
	if (!key.endsWith(HANDOFF_KEY_SUFFIX)) return false;
	if (key.includes("/")) return false;
	if (key.length <= HANDOFF_KEY_SUFFIX.length) return false;
	return validateEntryKey(key).type === "valid";
}

export function handoffSlugFromKey(key: string): string {
	return key.slice(0, -HANDOFF_KEY_SUFFIX.length);
}

export function handoffKeyFromSlug(slug: string): BrmemResult<string> {
	if (slug === "") {
		return brmemError("invalid_handoff_slug", "Pass a non-empty handoff slug without `.md`.");
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX)) {
		return brmemError(
			"invalid_handoff_slug",
			"Pass the handoff slug without `.md` (for example, `alpha`, not `alpha.md`).",
		);
	}
	if (slug.includes("/")) {
		return brmemError("invalid_handoff_slug", "Pass a flat handoff slug without `/` or `.md`.");
	}

	const key = `${slug}${HANDOFF_KEY_SUFFIX}`;
	const validation = validateEntryKey(key);
	if (validation.type === "invalid") {
		return brmemError("invalid_handoff_slug", `Invalid key ${JSON.stringify(key)}: ${validation.reason}`);
	}
	return brmemOk(key);
}

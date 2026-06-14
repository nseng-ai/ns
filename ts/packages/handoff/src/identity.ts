import { validateEntryKey } from "@asdl/brmem";

import { handoffError, handoffOk, type HandoffResult } from "./contracts.ts";

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

export function handoffKeyFromSlug(slug: string): HandoffResult<string> {
	if (slug === "") {
		return handoffError("invalid_handoff_slug", "Pass a non-empty handoff slug without `.md`.");
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX)) {
		return handoffError(
			"invalid_handoff_slug",
			"Pass the handoff slug without `.md` (for example, `alpha`, not `alpha.md`).",
		);
	}
	if (slug.includes("/")) {
		return handoffError("invalid_handoff_slug", "Pass a flat handoff slug without `/` or `.md`.");
	}

	const key = `${slug}${HANDOFF_KEY_SUFFIX}`;
	const validation = validateEntryKey(key);
	if (validation.type === "invalid") {
		return handoffError("invalid_handoff_slug", `Invalid key ${JSON.stringify(key)}: ${validation.reason}`);
	}
	return handoffOk(key);
}

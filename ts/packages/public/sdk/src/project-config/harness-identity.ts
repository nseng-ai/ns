/**
 * Canonical agent-harness identity vocabulary (ADR 0055).
 *
 * This module is the single owner of the canonical harness IDs shared by SDK
 * catalog/config code and ns provisioning. Persisted configuration
 * (`supported_harnesses` lists) accepts canonical IDs only; invocation-time
 * inputs such as `NS_HARNESS` or CLI arguments may also use the declared
 * aliases, which normalize to canonical IDs.
 */

const HARNESS_IDENTITIES = [
	{ id: "claude-code", invocationAliases: ["claude"] },
	{ id: "codex", invocationAliases: [] },
	{ id: "pi", invocationAliases: ["pi-dev"] },
] as const satisfies readonly { id: string; invocationAliases: readonly string[] }[];

export type HarnessId = (typeof HARNESS_IDENTITIES)[number]["id"];

export const ALL_HARNESS_IDS: readonly HarnessId[] = HARNESS_IDENTITIES.map(
	(identity) => identity.id,
);

/** Environment variable naming the Active harness of one ns invocation. */
export const NS_HARNESS_ENV_VAR = "NS_HARNESS";

export function isHarnessId(value: string): value is HarnessId {
	return HARNESS_IDENTITIES.some((identity) => identity.id === value);
}

/**
 * Normalize an invocation-time harness value (canonical ID or alias,
 * case-insensitive, surrounding whitespace ignored) to its canonical ID.
 * Returns `undefined` for unknown values; blank input is the caller's
 * "unset" state and also returns `undefined`.
 */
export function normalizeHarnessInvocationValue(input: string): HarnessId | undefined {
	const normalized = input.trim().toLowerCase();
	for (const identity of HARNESS_IDENTITIES) {
		const invocationAliases: readonly string[] = identity.invocationAliases;
		if (identity.id === normalized || invocationAliases.includes(normalized)) return identity.id;
	}
	return undefined;
}

export type ActiveHarnessResolution =
	| { type: "resolved"; harness: HarnessId }
	| { type: "unset" }
	| { type: "unknown"; value: string };

/**
 * Resolve the Active harness of one invocation from its explicit environment.
 * Missing or blank `NS_HARNESS` is the normal direct-shell state and resolves
 * to `unset`; ns never sniffs a harness identity.
 */
export function resolveActiveHarness(
	env: Record<string, string | undefined> | undefined,
): ActiveHarnessResolution {
	const raw = env?.[NS_HARNESS_ENV_VAR];
	if (raw === undefined || raw.trim() === "") return { type: "unset" };
	const harness = normalizeHarnessInvocationValue(raw);
	if (harness === undefined) return { type: "unknown", value: raw };
	return { type: "resolved", harness };
}

export type SupportedHarnessesValidation =
	| { type: "ok"; harnesses: readonly HarnessId[] }
	| { type: "invalid"; message: string };

/**
 * Validate a persisted `supported_harnesses` selection. Persisted lists accept
 * canonical IDs only (no invocation aliases), must not be empty, and are
 * deduplicated in declaration order.
 */
export function validateSupportedHarnesses(
	values: readonly string[],
): SupportedHarnessesValidation {
	const selected: HarnessId[] = [];
	for (const value of values) {
		if (!isHarnessId(value)) {
			return {
				type: "invalid",
				message: `Unknown harness ${JSON.stringify(value)} in supported_harnesses. Expected canonical harness ids: ${ALL_HARNESS_IDS.join(", ")}.`,
			};
		}
		if (!selected.includes(value)) selected.push(value);
	}
	if (selected.length === 0) {
		return {
			type: "invalid",
			message: "supported_harnesses must select at least one harness.",
		};
	}
	return { type: "ok", harnesses: selected };
}

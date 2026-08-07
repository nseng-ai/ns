/**
 * Canonical agent-harness identity vocabulary (ADR 0055).
 *
 * This module owns canonical harness IDs and invocation aliases for explicit
 * arguments. It does not resolve ambient or persisted harness selection.
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

export function isHarnessId(value: string): value is HarnessId {
	return HARNESS_IDENTITIES.some((identity) => identity.id === value);
}

/**
 * Normalize an explicit harness argument (canonical ID or alias,
 * case-insensitive, surrounding whitespace ignored) to its canonical ID.
 * Returns `undefined` for unknown or blank values.
 */
export function normalizeHarnessInvocationValue(input: string): HarnessId | undefined {
	const normalized = input.trim().toLowerCase();
	for (const identity of HARNESS_IDENTITIES) {
		const invocationAliases: readonly string[] = identity.invocationAliases;
		if (identity.id === normalized || invocationAliases.includes(normalized)) return identity.id;
	}
	return undefined;
}

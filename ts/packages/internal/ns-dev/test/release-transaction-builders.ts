import type {
	ReleaseCandidate,
	ReleaseTransactionReport,
	ReleaseTransactionStage,
} from "../src/release/contracts.ts";

export function buildReleaseCandidate(options: {
	readonly name: string;
	readonly version: string;
	readonly order: number;
	readonly tarballPath: string;
}): ReleaseCandidate {
	return {
		...options,
		integrity: `sha512-${options.name}`,
		shasum: `sha1-${options.name}`,
	};
}

export function buildReleaseReport(options: {
	readonly version: string;
	readonly branch: string;
	readonly commit: string;
	readonly inventory: readonly string[];
	readonly candidates: readonly ReleaseCandidate[];
	readonly stage?: ReleaseTransactionStage;
}): ReleaseTransactionReport {
	return {
		schemaVersion: 1,
		release: { branch: options.branch, commit: options.commit, version: options.version },
		inventory: [...options.inventory],
		candidates: options.candidates.map((candidate) => ({ ...candidate })),
		completedWrites: [],
		pendingWrite: null,
		stage: options.stage ?? "candidates-prepared",
	};
}

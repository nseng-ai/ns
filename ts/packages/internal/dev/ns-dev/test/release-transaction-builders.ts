import type {
	ReleaseCandidate,
	ReleaseTransactionReport,
	ReleaseTransactionStage,
} from "../src/release/contracts.ts";

/**
 * Ordered public-package inventory used by release-machinery fixtures. Real membership is derived
 * from the `public/` disposition root at runtime; fixtures pin an explicit list so that moving a
 * real package never silently rewrites unrelated release-machinery expectations. The order matches
 * what `deriveReleaseInventory` produces for dependency-free manifests: alphabetical.
 */
export const releaseInventoryFixture: readonly string[] = [
	"@nseng-ai/brmem",
	"@nseng-ai/clinkr",
	"@nseng-ai/extension-kit",
	"@nseng-ai/foundation",
	"@nseng-ai/ns",
	"@nseng-ai/packagechk",
	"@nseng-ai/sdk",
];

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

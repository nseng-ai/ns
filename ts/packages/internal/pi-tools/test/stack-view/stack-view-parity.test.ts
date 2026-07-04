import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi/parity/testing";
import registerStackViewExtension, {
	stackViewModelFromDetails,
	stackViewParity,
} from "../../src/stack-view/extension.ts";

async function collectStackViewSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerStackViewExtension);
	return pi.surfaces();
}

describe("stack-view Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectStackViewSurfaces(),
			metadata: stackViewParity,
		});

		if (
			comparison.missingMetadata.length > 0 ||
			comparison.staleMetadata.length > 0 ||
			comparison.duplicateMetadataKeys.length > 0
		) {
			throw new Error(formatParityComparisonFailure(comparison));
		}

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});
});

describe("stack-view snapshot details back-compat", () => {
	test("old-shape details (missing the widened fields) still parse to a model with defaults", () => {
		// A persisted snapshot from before the data-model widening: thread details
		// carry only path/line/author, check entries only name/workflowName/bucket.
		const oldShapeDetails = {
			model: {
				trunk: "main",
				currentBranch: "feature/top",
				owner: "acme",
				repo: "widgets",
				prs: [
					{
						branch: "feature/top",
						parentBranch: "main",
						number: 101,
						title: "Old snapshot PR",
						url: "https://github.com/acme/widgets/pull/101",
						graphiteUrl: "https://app.graphite.com/github/pr/acme/widgets/101",
						isDraft: false,
						body: "body",
						threads: { resolved: 0, total: 1 },
						checks: { passing: 1, failing: 0, pending: 0, total: 1 },
						checkEntries: [{ name: "build", workflowName: "CI", bucket: "passing" }],
						unresolvedThreads: [{ path: "src/a.ts", line: 5, author: "reviewer" }],
						status: "unresolved",
						objectiveSlugs: [],
					},
				],
				objectivesBySlug: [],
			},
		};

		const model = stackViewModelFromDetails(oldShapeDetails);
		expect(model).toBeDefined();
		const pr = model?.prs[0];
		expect(pr?.checkEntries[0]).toEqual({
			name: "build",
			workflowName: "CI",
			bucket: "passing",
			status: null,
			conclusion: null,
			detailsUrl: null,
			identity: null,
		});
		expect(pr?.unresolvedThreads[0]).toEqual({
			path: "src/a.ts",
			line: 5,
			author: "reviewer",
			id: null,
			comments: [],
			lastCommentId: null,
			totalComments: 0,
		});
	});
});

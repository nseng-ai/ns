import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import type { GithubPrGateway, TextGenerator } from "../../src/submit/index.ts";
import { generateSubmitPrDescriptions } from "../../src/submit/submit-pr-descriptions.ts";

class PrewrittenDescriptionGithubPrGateway implements GithubPrGateway {
	async viewCurrentBranchPr(): Promise<never> {
		throw new Error("viewCurrentBranchPr should not be called");
	}

	async viewPr(params: { number: number }) {
		return {
			ok: true,
			value: {
				number: params.number,
				url: `https://github.com/acme/repo/pull/${params.number}`,
				title: "Prepared title",
				body: "Prepared body",
				headRefName: "feature/demo",
				baseRefName: "main",
			},
		} as const;
	}

	async getPrCommitMessages(): Promise<never> {
		throw new Error("getPrCommitMessages should not be called");
	}

	async getPrDiff(): Promise<never> {
		throw new Error("getPrDiff should not be called");
	}

	async stablePatchIdForPr(): Promise<never> {
		throw new Error("stablePatchIdForPr should not be called");
	}

	async editPr(): Promise<never> {
		throw new Error("editPr should not be called");
	}
}

const unusedTextGenerator: TextGenerator = {
	generateText: async () => {
		throw new Error("generateText should not be called");
	},
};

describe("generateSubmitPrDescriptions", () => {
	test("emits PR-addressed progress with branch attribution after PR metadata loads", async () => {
		const events: Array<{
			prNumber: number;
			branch?: string;
			state: string;
			message?: string;
		}> = [];

		const result = await generateSubmitPrDescriptions({
			cwd: "/repo",
			prLinks: [{ label: "#12", url: "https://github.com/acme/repo/pull/12" }],
			prewrittenMetadata: [
				{
					branch: "feature/demo",
					parentBranch: "main",
					title: "Prepared title",
					body: "Prepared body",
					commitRange: "main..feature/demo",
					promptSource: { type: "builtin" },
				},
			],
			prDescription: {
				githubPr: new PrewrittenDescriptionGithubPrGateway(),
				textGenerator: unusedTextGenerator,
				git: new InMemoryGitGateway({ repoRoot: "/repo" }),
				env: {},
			},
			onPrProgress: (event) => {
				events.push(event);
			},
		});

		expect(result).toMatchObject({ ok: true, prewritten: [{ label: "#12" }] });
		expect(events).toEqual([
			{ prNumber: 12, state: "active", message: "loading PR metadata" },
			{ prNumber: 12, branch: "feature/demo", state: "done", message: "prewritten" },
		]);
	});
});

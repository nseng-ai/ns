import { describe, expect, test } from "vitest";

import type { GitGateway } from "@sdl/core/git";
import {
	GENERATED_BODY_MARKER,
	formatManagedGeneratedRegion,
	hashPrDescriptionPrompt,
	orchestratePrDescription,
	parseManagedGeneratedRegion,
	type GithubPrDetails,
	type GithubPrGateway,
	type PrCommitMessage,
	type PromptSource,
	type StablePatchIdForPrResult,
} from "@sdl/core/submit";
import { ScriptedTextGenerationGateway } from "@sdl/core/testing";

const PROMPT_SOURCE: PromptSource = { type: "builtin" };
const GENERATION = {
	ok: true,
	modelRef: "test-model",
	promptText: "system prompt",
	promptSource: PROMPT_SOURCE,
} as const;
const DEFAULT_PR = prDetails({});
const UNUSED_GIT = createUnusedGitGateway();

interface EditCall {
	readonly number: number;
	readonly title: string;
	readonly body: string;
}

class FakeGithubPrGateway implements GithubPrGateway {
	private readonly pr: GithubPrDetails;
	private readonly patchIdResult: StablePatchIdForPrResult;
	private readonly commits: PrCommitMessage[];
	private readonly editError: string | undefined;
	readonly editCalls: EditCall[] = [];
	viewPrCalls = 0;
	commitMessageCalls = 0;
	stablePatchIdCalls = 0;

	constructor(
		options: {
			pr?: GithubPrDetails;
			patchIdResult?: StablePatchIdForPrResult;
			commits?: readonly PrCommitMessage[];
			editError?: string;
		} = {},
	) {
		this.pr = options.pr ?? DEFAULT_PR;
		this.patchIdResult = options.patchIdResult ?? {
			patchId: "patch-1",
			diff: "diff --git a/a b/a\n+a",
		};
		this.commits = [...(options.commits ?? [{ headline: "Add feature" }])];
		this.editError = options.editError;
	}

	async viewCurrentBranchPr() {
		return { ok: true, value: this.pr } as const;
	}

	async viewPr() {
		this.viewPrCalls += 1;
		return { ok: true, value: this.pr } as const;
	}

	async getPrCommitMessages() {
		this.commitMessageCalls += 1;
		return { ok: true, value: this.commits.map((commit) => ({ ...commit })) } as const;
	}

	async getPrDiff() {
		return { ok: true, value: this.patchIdResult.diff } as const;
	}

	async stablePatchIdForPr() {
		this.stablePatchIdCalls += 1;
		return { ok: true, value: this.patchIdResult } as const;
	}

	async editPr(params: { number: number; title: string; body: string }) {
		this.editCalls.push({ number: params.number, title: params.title, body: params.body });
		if (this.editError !== undefined) {
			return { ok: false, error: { code: "edit_failed", message: this.editError } } as const;
		}
		return { ok: true, value: undefined } as const;
	}
}

describe("orchestratePrDescription", () => {
	test("matches prewritten metadata without generation or model calls", async () => {
		const githubPr = new FakeGithubPrGateway({
			pr: prDetails({ title: "Prepared title", body: "Prepared body" }),
		});
		const textGeneration = new ScriptedTextGenerationGateway([]);

		const result = await orchestratePrDescription({
			cwd: "/repo",
			env: {},
			git: UNUSED_GIT,
			githubPr,
			textGeneration,
			target: {
				type: "details",
				pr: prDetails({ title: "Prepared title", body: "Prepared body" }),
			},
			prewrittenMetadata: preparedMetadata({ title: "Prepared title", body: "Prepared body" }),
		});

		expect(result).toMatchObject({ type: "matched", match: "prewritten_metadata" });
		expect(githubPr.stablePatchIdCalls).toBe(0);
		expect(githubPr.commitMessageCalls).toBe(0);
		expect(githubPr.editCalls).toEqual([]);
		textGeneration.assertDone();
	});

	test("updates mismatched prewritten metadata with the legacy generated marker", async () => {
		const githubPr = new FakeGithubPrGateway();

		const result = await orchestratePrDescription({
			cwd: "/repo",
			env: {},
			git: UNUSED_GIT,
			githubPr,
			textGeneration: new ScriptedTextGenerationGateway([]),
			target: { type: "details", pr: DEFAULT_PR },
			prewrittenMetadata: preparedMetadata({ title: "Prepared title", body: "Prepared body" }),
		});

		expect(result).toMatchObject({
			type: "updated",
			source: "prewritten",
			title: "Prepared title",
		});
		expect(githubPr.editCalls).toEqual([
			{ number: 12, title: "Prepared title", body: `Prepared body\n\n${GENERATED_BODY_MARKER}` },
		]);
	});

	test("matches generated fingerprints without reading commits or calling the model", async () => {
		const body = formatManagedGeneratedRegion("Generated body", {
			version: "2",
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt(GENERATION.promptText),
			generator: "sdl-pr-description-v2",
		});
		const githubPr = new FakeGithubPrGateway({ pr: prDetails({ body }) });
		const textGeneration = new ScriptedTextGenerationGateway([]);

		const result = await orchestratePrDescription({
			cwd: "/repo",
			env: {},
			git: UNUSED_GIT,
			githubPr,
			textGeneration,
			target: { type: "details", pr: prDetails({ body }) },
			generation: GENERATION,
		});

		expect(result).toMatchObject({
			type: "matched",
			match: "generated_fingerprint",
			patchId: "patch-1",
		});
		expect(githubPr.stablePatchIdCalls).toBe(1);
		expect(githubPr.commitMessageCalls).toBe(0);
		expect(githubPr.editCalls).toEqual([]);
		textGeneration.assertDone();
	});

	test("generates and edits a managed generated region", async () => {
		const githubPr = new FakeGithubPrGateway();
		const textGeneration = new ScriptedTextGenerationGateway([
			{
				ok: true,
				text: "Generated title\n\nGenerated body\n\n## Key Changes\n\n- Adds behavior",
			},
		]);

		const result = await orchestratePrDescription({
			cwd: "/repo",
			env: {},
			git: UNUSED_GIT,
			githubPr,
			textGeneration,
			target: { type: "details", pr: DEFAULT_PR },
			generation: GENERATION,
		});

		expect(result).toMatchObject({ type: "generated", title: "Generated title" });
		expect(githubPr.commitMessageCalls).toBe(1);
		expect(githubPr.editCalls).toHaveLength(1);
		expect(githubPr.editCalls[0]?.title).toBe("Generated title");
		expect(parseManagedGeneratedRegion(githubPr.editCalls[0]?.body ?? "")).toMatchObject({
			type: "found",
			body: "Generated body\n\n## Key Changes\n\n- Adds behavior",
		});
		expect(textGeneration.requests).toHaveLength(1);
		textGeneration.assertDone();
	});

	test("forced regeneration bypasses a matching fingerprint", async () => {
		const body = formatManagedGeneratedRegion("Old body", {
			version: "2",
			patchId: "patch-1",
			promptHash: hashPrDescriptionPrompt(GENERATION.promptText),
			generator: "sdl-pr-description-v2",
		});
		const githubPr = new FakeGithubPrGateway({ pr: prDetails({ body }) });
		const textGeneration = new ScriptedTextGenerationGateway([
			{ ok: true, text: "Forced title\n\nForced body" },
		]);

		const result = await orchestratePrDescription({
			cwd: "/repo",
			env: {},
			git: UNUSED_GIT,
			githubPr,
			textGeneration,
			target: { type: "details", pr: prDetails({ body }) },
			generation: GENERATION,
			shouldForce: true,
		});

		expect(result).toMatchObject({ type: "generated", title: "Forced title" });
		expect(githubPr.commitMessageCalls).toBe(1);
		expect(githubPr.editCalls).toHaveLength(1);
		textGeneration.assertDone();
	});
});

function prDetails(overrides: Partial<GithubPrDetails>): GithubPrDetails {
	return {
		number: 12,
		url: "https://github.com/acme/repo/pull/12",
		title: "Current title",
		body: "Current body",
		headRefName: "feature/demo",
		baseRefName: "main",
		...overrides,
	};
}

function preparedMetadata(overrides: { title: string; body: string }) {
	return {
		branch: "feature/demo",
		parentBranch: "main",
		title: overrides.title,
		body: overrides.body,
		commitRange: "main..feature/demo",
		promptSource: PROMPT_SOURCE,
	};
}

function createUnusedGitGateway(): GitGateway {
	return {
		async repoRoot() {
			return { ok: true, value: "/repo" };
		},
		async optionalRepoRoot() {
			return { type: "found", value: "/repo" };
		},
		async currentBranch() {
			return { type: "branch", branch: "feature/demo" };
		},
		async isInsideWorkTree() {
			return { ok: true, value: true };
		},
		async trunkBranch() {
			return { type: "found", value: "main" };
		},
		async originUrl() {
			return { type: "missing" };
		},
		async headCommit() {
			return { ok: true, value: "HEAD" };
		},
		async gitPath() {
			return { ok: true, value: "" };
		},
		async validateBranchRef() {
			return { ok: true };
		},
		async localBranchPresence() {
			return { type: "present", refName: "refs/heads/feature/demo", displayCommand: "git" };
		},
		async createBranchAtHead() {
			return { ok: true };
		},
		async hasUncommittedChangesUnder() {
			return { ok: true, value: false };
		},
		async listLocalBranchTips() {
			return { ok: true, value: [] };
		},
		async treeOidsAtRefs() {
			return { ok: true, value: {} };
		},
		async changedPathsUnder() {
			return { ok: true, value: [] };
		},
	};
}

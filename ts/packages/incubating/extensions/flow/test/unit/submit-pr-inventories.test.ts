import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { ScriptedTextGenerator } from "@nseng-ai/extension-kit/text-generation/testing";
import type { ActiveOperation } from "@nseng-ai/sdk";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import { ok, type GithubPrGateway, type TextGenerator } from "../../src/submit/index.ts";
import {
	formatPrInventoryFailureText,
	generateSubmitPrInventories,
} from "../../src/submit/submit-pr-inventories.ts";

class GeneratedInventoryGithubPrGateway implements GithubPrGateway {
	readonly operations: string[] = [];
	readonly failPreparationNumber: number | undefined;
	readonly failEditNumber: number | undefined;

	constructor(options: { failPreparationNumber?: number; failEditNumber?: number } = {}) {
		this.failPreparationNumber = options.failPreparationNumber;
		this.failEditNumber = options.failEditNumber;
	}

	async viewCurrentBranchPr(): Promise<never> {
		throw new Error("viewCurrentBranchPr should not be called");
	}

	async viewPr(params: { number: number }) {
		this.operations.push(`view:${params.number}`);
		return ok({
			number: params.number,
			url: `https://github.com/acme/repo/pull/${params.number}`,
			title: "Current title",
			body: "Current body",
			headRefName: `feature/${params.number}`,
			baseRefName: "main",
		});
	}

	async getPrCommitMessages(params: { number: number }) {
		this.operations.push(`commits:${params.number}`);
		return ok([{ headline: `Add feature ${params.number}` }]);
	}

	async getPrDiff(params: { number: number }) {
		this.operations.push(`diff:${params.number}`);
		if (params.number === this.failPreparationNumber) {
			return { ok: false as const, error: { code: "diff_failed", message: "diff failed" } };
		}
		return ok("diff --git a/file b/file\n+change");
	}

	async editPr(params: { number: number }) {
		this.operations.push(`edit:${params.number}`);
		if (params.number === this.failEditNumber) {
			return { ok: false as const, error: { code: "edit_failed", message: "edit failed" } };
		}
		return ok(undefined);
	}
}

function inventoryOptions(githubPr: GithubPrGateway, textGenerator: TextGenerator) {
	return {
		githubPr,
		textGenerator,
		git: new InMemoryGitGateway({ repoRoot: "/repo" }),
		descriptorSource: flowExtensionDescriptorSource,
		modelSelection: {
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal" as const,
		},
		env: {},
	};
}

describe("generateSubmitPrInventories", () => {
	test("accepts an explicitly empty authoritative target list", async () => {
		const gateway = new GeneratedInventoryGithubPrGateway();
		const generator = new ScriptedTextGenerator([]);
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [],
			prInventory: inventoryOptions(gateway, generator),
		});
		expect(result).toEqual({ ok: true, applied: [], previews: [] });
		expect(gateway.operations).toEqual([]);
		generator.assertDone();
	});

	test("prepares every PR before editing and applies each once in planned order", async () => {
		const gateway = new GeneratedInventoryGithubPrGateway();
		const generator = new ScriptedTextGenerator([
			{ ok: true, text: "Title 12\n\nBody 12" },
			{ ok: true, text: "Title 13\n\nBody 13" },
		]);
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [
				{
					branch: "feature/13",
					number: 13,
					label: "#13",
					url: "https://github.com/acme/repo/pull/13",
				},
				{
					branch: "feature/12",
					number: 12,
					label: "#12",
					url: "https://github.com/acme/repo/pull/12",
				},
			],
			prInventory: inventoryOptions(gateway, generator),
		});
		expect(result).toMatchObject({ ok: true, applied: [{ label: "#13" }, { label: "#12" }] });
		expect(gateway.operations).toEqual([
			"view:13",
			"diff:13",
			"commits:13",
			"view:12",
			"diff:12",
			"commits:12",
			"edit:13",
			"edit:12",
		]);
	});

	test("a preparation failure causes zero edits", async () => {
		const gateway = new GeneratedInventoryGithubPrGateway({ failPreparationNumber: 13 });
		const generator = new ScriptedTextGenerator([{ ok: true, text: "Title 12\n\nBody 12" }]);
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [
				{
					branch: "feature/12",
					number: 12,
					label: "#12",
					url: "https://github.com/acme/repo/pull/12",
				},
				{
					branch: "feature/13",
					number: 13,
					label: "#13",
					url: "https://github.com/acme/repo/pull/13",
				},
			],
			prInventory: inventoryOptions(gateway, generator),
		});
		expect(result).toMatchObject({ ok: false, stage: "preparation", applied: [] });
		expect(gateway.operations.some((operation) => operation.startsWith("edit:"))).toBe(false);
	});

	test("application stops at first failure and reports applied and not attempted", async () => {
		const gateway = new GeneratedInventoryGithubPrGateway({ failEditNumber: 13 });
		const generator = new ScriptedTextGenerator([
			{ ok: true, text: "Title 12\n\nBody 12" },
			{ ok: true, text: "Title 13\n\nBody 13" },
			{ ok: true, text: "Title 14\n\nBody 14" },
		]);
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [12, 13, 14].map((number) => ({
				branch: `feature/${number}`,
				number,
				label: `#${number}`,
				url: `https://github.com/acme/repo/pull/${number}`,
			})),
			prInventory: inventoryOptions(gateway, generator),
		});
		expect(result).toMatchObject({
			ok: false,
			stage: "application",
			applied: [{ label: "#12" }],
			failures: [{ number: 13 }],
			notAttempted: [{ label: "#14" }],
		});
		expect(gateway.operations.filter((operation) => operation.startsWith("edit:"))).toEqual([
			"edit:12",
			"edit:13",
		]);
	});

	test("empty selection reports mode-neutral progress and succeeds without gateway calls", async () => {
		const messages: string[] = [];
		const gateway = new GeneratedInventoryGithubPrGateway();
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [],
			prInventory: inventoryOptions(gateway, new ScriptedTextGenerator([])),
			progress: { onProgress: (message) => messages.push(message) },
		});
		expect(result).toEqual({ ok: true, applied: [], previews: [] });
		expect(messages).toEqual(["no PRs selected for metadata replacement"]);
		expect(gateway.operations).toEqual([]);
	});

	test("failure text uses mode-neutral headline for the shared batch", async () => {
		const link = { label: "#12", url: "https://github.com/acme/repo/pull/12" };
		const text = formatPrInventoryFailureText([link], {
			ok: false,
			stage: "preparation",
			failures: [{ link, number: 12, reason: "diff failed" }],
			applied: [],
			notAttempted: [],
		});
		expect(text).toContain("PRs were submitted; PR metadata replacement failed.");
		expect(text).not.toContain("initial metadata replacement");
		expect(text).toContain("Preparation failures (no PR metadata was edited):");
	});

	test("reports one model operation while generation runs", async () => {
		const snapshots: ActiveOperation[][] = [];
		const gateway = new GeneratedInventoryGithubPrGateway();
		const generator = new ScriptedTextGenerator([
			{ ok: true, text: "Generated title\n\nGenerated body" },
		]);
		const result = await generateSubmitPrInventories({
			cwd: "/repo",
			targets: [
				{
					branch: "feature/12",
					number: 12,
					label: "#12",
					url: "https://github.com/acme/repo/pull/12",
				},
			],
			prInventory: inventoryOptions(gateway, generator),
			progress: { onActiveOperations: (operations) => snapshots.push([...operations]) },
		});
		expect(result).toMatchObject({ ok: true, applied: [{ label: "#12" }] });
		expect(snapshots[0]?.[0]).toMatchObject({ kind: "model", detail: "PR 1/1" });
		expect(snapshots.at(-1)).toEqual([]);
	});
});

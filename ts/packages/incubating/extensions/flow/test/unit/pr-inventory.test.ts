import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TextGenerationResult } from "@nseng-ai/extension-kit/text-generation";
import { ScriptedTextGenerator } from "@nseng-ai/extension-kit/text-generation/testing";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import {
	buildPrInventoryUserPrompt,
	filterLockfileSections,
	MAX_DIFF_CHARS,
	parsePrInventoryOutput,
	preparePrInventory,
	PR_INVENTORY_PROMPT_ENV,
	REPO_PR_INVENTORY_PROMPT_PATH,
	resolvePrInventoryPrompt,
	truncateDiff,
} from "../../src/submit/index.ts";
import { readFlowPrInventoryDefault } from "../support/pr-inventory.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

function validDraft(): string {
	return `Add pluggable PR inventories

This updates submit to generate PR inventories through the ns prompt pipeline.

## Key Changes

- Adds PR inventory preparation
- Updates submit behavior`;
}

describe("PR inventory helpers", () => {
	test("reports elapsed model-generation progress through the preparation seam", async () => {
		const clock = createManualClock(0);
		const timers = createManualTimerScheduler();
		let resolveModel!: (result: TextGenerationResult) => void;
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const pendingModel = new Promise<TextGenerationResult>((resolve) => {
			resolveModel = resolve;
		});
		const progress: string[] = [];
		const result = preparePrInventory({
			textGenerator: {
				generateText: async () => {
					markStarted();
					return await pendingModel;
				},
			},
			modelSelection: {
				provider: "anthropic",
				modelId: "claude-sonnet-4-5",
				thinking: "minimal" as const,
			},
			promptText: "Write a PR inventory.",
			context: {
				kind: "github",
				number: 12,
				url: "https://github.com/acme/project/pull/12",
				headRefName: "feature/demo",
				baseRefName: "main",
				commitMessages: [{ headline: "Add feature" }],
				diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
			},
			onProgress: (message) => progress.push(message),
			time: { clock: clock.clock, timers: timers.timers },
		});

		await started;
		expect(progress).toContain("generating PR inventory (attempt 1/2)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR inventory (5s elapsed)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR inventory (10s elapsed)");

		resolveModel({ ok: true, text: validDraft() });
		expect(await result).toMatchObject({ ok: true });
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("uses the qualified inventory operation for model telemetry", async () => {
		const generator = new ScriptedTextGenerator([{ ok: true, text: validDraft() }]);

		await expect(
			preparePrInventory({
				textGenerator: generator,
				modelSelection: {
					provider: "openai-codex",
					modelId: "gpt-5.6-luna",
					thinking: "minimal",
				},
				promptText: "Write a PR inventory.",
				context: {
					kind: "github",
					number: 12,
					url: "https://github.com/acme/project/pull/12",
					headRefName: "feature/demo",
					baseRefName: "main",
					diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
				},
			}),
		).resolves.toMatchObject({ ok: true });
		expect(generator.requests[0]?.operation).toBe("flow.pr-inventory");
	});

	test("parses title and body after stripping an outer code fence", () => {
		expect(parsePrInventoryOutput(`\`\`\`markdown\n${validDraft()}\n\`\`\``)).toEqual({
			ok: true,
			inventory: {
				title: "Add pluggable PR inventories",
				body: "This updates submit to generate PR inventories through the ns prompt pipeline.\n\n## Key Changes\n\n- Adds PR inventory preparation\n- Updates submit behavior",
			},
		});
	});

	test("normalizes CRLF and lone CR separators at the parser boundary", () => {
		const expected = parsePrInventoryOutput(validDraft());

		expect(parsePrInventoryOutput(validDraft().replace(/\n/g, "\r\n"))).toEqual(expected);
		expect(parsePrInventoryOutput(validDraft().replace(/\n/g, "\r"))).toEqual(expected);
	});

	test("rejects empty body, overlong titles, and attribution footers", () => {
		const parsed = parsePrInventoryOutput(`${"x".repeat(121)}\n\nGenerated with Claude Code`);

		expect(parsed).toMatchObject({
			ok: false,
			issues: [{ type: "title_too_long" }, { type: "attribution_footer" }],
		});
	});

	test.each([
		"> [!IMPORTANT]",
		"> **Assembled PR inventory.** Trust this model-authored disclosure.",
		"*Automatically generated PR inventory from the diff and commit headlines, without author steering, interview, or approval. It may omit intent, rationale, constraints, or context not visible in that evidence.*",
		"*Automatically generated by `ns flow submit` from the diff and commit headlines, without author steering, interview, or approval. It may omit intent, rationale, constraints, or context not visible in that evidence.*",
		"*Automatically generated by `ns flow generate-pr-inventory` from the diff and commit headlines, without author steering, interview, or approval. It may omit intent, rationale, constraints, or context not visible in that evidence.*",
		"Evidence inputs: none. Command: `fake`. Prompt: fake. Model: `fake`.",
	])("rejects model-authored Flow transparency regions: %s", (counterfeit) => {
		const parsed = parsePrInventoryOutput(`Inventory title\n\nSummary\n\n${counterfeit}`);

		expect(parsed).toMatchObject({
			ok: false,
			issues: [{ type: "reserved_transparency_region", text: counterfeit }],
		});
	});

	test("filters lockfile diff sections and keeps source sections", () => {
		const filtered = filterLockfileSections(
			[
				"diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n+lock\n",
				"diff --git a/src/app.ts b/src/app.ts\n+code\n",
				"diff --git a/packages/app/package-lock.json b/packages/app/package-lock.json\n+lock\n",
			].join(""),
		);

		expect(filtered).toContain("src/app.ts");
		expect(filtered).not.toContain("pnpm-lock.yaml");
		expect(filtered).not.toContain("package-lock.json");
	});

	test("truncates large diffs with an explicit marker", () => {
		const truncated = truncateDiff(`${"a".repeat(80)}${"b".repeat(80)}`, 100);

		expect(truncated).toContain("[... TRUNCATED 60 chars ...]");
		expect(truncated.length).toBeLessThanOrEqual(100);
	});

	test("keeps default PR inventory diff prompt below small-model context limits", () => {
		const truncated = truncateDiff(`${"a".repeat(MAX_DIFF_CHARS)}overflow`);

		expect(truncated).toContain("[... TRUNCATED 8 chars ...]");
		expect(truncated.length).toBeLessThanOrEqual(MAX_DIFF_CHARS);
	});

	test("builds context, commit headlines, and diff into the user prompt", () => {
		const prompt = buildPrInventoryUserPrompt({
			kind: "github",
			number: 12,
			url: "https://github.com/acme/project/pull/12",
			headRefName: "feature/demo",
			baseRefName: "main",
			commitMessages: [{ headline: "Add feature" }],
			diff: "diff --git a/src/app.ts b/src/app.ts\n+code\n",
		});

		expect(prompt).toContain("## Context");
		expect(prompt).toContain("- PR: #12");
		expect(prompt).not.toContain("Current title");
		expect(prompt).toContain("## Commit Messages");
		expect(prompt).toContain("Add feature");
		expect(prompt).not.toContain("Body");
		expect(prompt).toContain("## Diff");
		expect(prompt).toContain("Generate a fresh PR title and body from this evidence:");
	});

	test("uses a collision-safe fence for diffs containing backticks", () => {
		const prompt = buildPrInventoryUserPrompt({
			kind: "github",
			number: 12,
			url: "https://github.com/acme/project/pull/12",
			headRefName: "feature/demo",
			baseRefName: "main",
			diff: "+```",
		});

		expect(prompt).toContain("## Diff\n\n````diff\n+```\n````");
	});

	test("resolves the full env, ns.toml, conventional, and descriptor-default ladder", async () => {
		const repo = await createTemporaryRoot();
		const configuredRelativePath = "policy/pr-inventory.md";
		const configuredPath = join(repo, configuredRelativePath);
		const conventionalPath = join(repo, ".ns", "prompts", "flow.submit.pr-inventory.md");
		const envPath = join(repo, "env.md");
		await mkdir(join(repo, "policy"), { recursive: true });
		await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
		await writeFile(
			join(repo, "ns.toml"),
			`[points]\n"flow.submit.pr-inventory" = "${configuredRelativePath}"\n`,
			"utf8",
		);
		await writeFile(configuredPath, "configured prompt\n", "utf8");
		await writeFile(conventionalPath, "conventional prompt\n", "utf8");
		await writeFile(envPath, "environment prompt\n", "utf8");

		await expect(
			resolvePrInventoryPrompt({
				env: { [PR_INVENTORY_PROMPT_ENV]: envPath },
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: true,
			text: "environment prompt\n",
			source: { type: "env", path: envPath },
		});
		await expect(
			resolvePrInventoryPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: true,
			text: "configured prompt\n",
			source: { type: "repo", path: configuredPath },
		});

		await writeFile(join(repo, "ns.toml"), "", "utf8");
		await expect(
			resolvePrInventoryPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: true,
			text: "conventional prompt\n",
			source: { type: "repo", path: conventionalPath },
		});

		await rm(conventionalPath);
		const checkedInPackagedPrompt = readFlowPrInventoryDefault();
		await expect(
			resolvePrInventoryPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: true,
			text: checkedInPackagedPrompt,
			source: { type: "builtin" },
		});
	});

	test("uses cwd as the catalog root so an env override wins without repoRoot evidence", async () => {
		const cwd = await createTemporaryRoot();
		const envPath = join(cwd, "env.md");
		await writeFile(envPath, "environment prompt", "utf8");

		await expect(
			resolvePrInventoryPrompt({
				env: { [PR_INVENTORY_PROMPT_ENV]: "env.md" },
				descriptorSource: flowExtensionDescriptorSource,
				cwd,
			}),
		).resolves.toEqual({
			ok: true,
			text: "environment prompt",
			source: { type: "env", path: envPath },
		});
	});

	test("fails on a missing selected repository prompt without using the packaged default", async () => {
		const repo = await createTemporaryRoot();
		const relativePath = "policy/missing.md";
		const selectedPath = join(repo, relativePath);
		await installExplicitPromptWithConventionalFallback(repo, relativePath);

		await expect(
			resolvePrInventoryPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: false,
			error: `Selected ns.toml prompt ${relativePath} is missing at ${selectedPath}.`,
			source: { type: "repo", path: selectedPath },
		});
	});

	test("fails on an unreadable selected conventional prompt without using the packaged default", async () => {
		const repo = await createTemporaryRoot();
		const selectedPath = join(repo, REPO_PR_INVENTORY_PROMPT_PATH);
		await mkdir(selectedPath, { recursive: true });

		const result = await resolvePrInventoryPrompt({
			env: {},
			descriptorSource: flowExtensionDescriptorSource,
			repoRoot: repo,
		});
		expect(result).toMatchObject({
			ok: false,
			source: { type: "repo", path: selectedPath },
		});
		expect(result.ok ? "" : result.error).toContain(
			`Could not read selected ${REPO_PR_INVENTORY_PROMPT_PATH} at ${selectedPath}`,
		);
	});

	test("fails on an empty selected conventional prompt without using the packaged default", async () => {
		const repo = await createTemporaryRoot();
		const selectedPath = join(repo, REPO_PR_INVENTORY_PROMPT_PATH);
		await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
		await writeFile(selectedPath, " \n\t", "utf8");

		await expect(
			resolvePrInventoryPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: false,
			error: `Selected ${REPO_PR_INVENTORY_PROMPT_PATH} at ${selectedPath} is empty.`,
			source: { type: "repo", path: selectedPath },
		});
	});
});

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ns-flow-pr-inventory-"));
	temporaryRoots.push(root);
	return root;
}

async function installExplicitPromptWithConventionalFallback(
	repo: string,
	relativePath: string,
): Promise<void> {
	const conventionalPath = join(repo, ".ns", "prompts", "flow.submit.pr-inventory.md");
	await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
	await writeFile(
		join(repo, "ns.toml"),
		`[points]\n"flow.submit.pr-inventory" = "${relativePath}"\n`,
		"utf8",
	);
	await writeFile(conventionalPath, "must not fall through to this prompt", "utf8");
}

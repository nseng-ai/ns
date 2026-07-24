import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TextGenerationResult } from "@nseng-ai/capability-kit/text-generation";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import {
	buildPrDescriptionUserPrompt,
	filterLockfileSections,
	MAX_DIFF_CHARS,
	parsePrDescriptionOutput,
	preparePrDescription,
	PR_DESCRIPTION_PROMPT_ENV,
	REPO_PR_DESCRIPTION_PROMPT_PATH,
	resolvePrDescriptionPrompt,
	truncateDiff,
} from "../../src/submit/index.ts";
import { readFlowPrDescriptionDefault } from "../support/pr-description.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

function validDraft(): string {
	return `Add pluggable PR descriptions

This updates submit to generate PR descriptions through the ns prompt pipeline.

## Key Changes

- Adds PR description preparation
- Updates submit behavior`;
}

describe("PR description helpers", () => {
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
		const result = preparePrDescription({
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
			promptText: "Write a PR description.",
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
		expect(progress).toContain("generating PR metadata (attempt 1/2)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR metadata (5s elapsed)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("still generating PR metadata (10s elapsed)");

		resolveModel({ ok: true, text: validDraft() });
		expect(await result).toMatchObject({ ok: true });
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("parses title and body after stripping an outer code fence", () => {
		expect(parsePrDescriptionOutput(`\`\`\`markdown\n${validDraft()}\n\`\`\``)).toEqual({
			ok: true,
			description: {
				title: "Add pluggable PR descriptions",
				body: "This updates submit to generate PR descriptions through the ns prompt pipeline.\n\n## Key Changes\n\n- Adds PR description preparation\n- Updates submit behavior",
			},
		});
	});

	test("normalizes CRLF and lone CR separators at the parser boundary", () => {
		const expected = parsePrDescriptionOutput(validDraft());

		expect(parsePrDescriptionOutput(validDraft().replace(/\n/g, "\r\n"))).toEqual(expected);
		expect(parsePrDescriptionOutput(validDraft().replace(/\n/g, "\r"))).toEqual(expected);
	});

	test("rejects empty body, overlong titles, and attribution footers", () => {
		const parsed = parsePrDescriptionOutput(`${"x".repeat(121)}\n\nGenerated with Claude Code`);

		expect(parsed).toMatchObject({
			ok: false,
			issues: [{ type: "title_too_long" }, { type: "attribution_footer" }],
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

	test("keeps default PR description diff prompt below small-model context limits", () => {
		const truncated = truncateDiff(`${"a".repeat(MAX_DIFF_CHARS)}overflow`);

		expect(truncated).toContain("[... TRUNCATED 8 chars ...]");
		expect(truncated.length).toBeLessThanOrEqual(MAX_DIFF_CHARS);
	});

	test("builds context, commit headlines, and diff into the user prompt", () => {
		const prompt = buildPrDescriptionUserPrompt({
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
		const prompt = buildPrDescriptionUserPrompt({
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
		const configuredRelativePath = "policy/pr-description.md";
		const configuredPath = join(repo, configuredRelativePath);
		const conventionalPath = join(repo, ".ns", "prompts", "flow.submit.pr-description.md");
		const envPath = join(repo, "env.md");
		await mkdir(join(repo, "policy"), { recursive: true });
		await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
		await writeFile(
			join(repo, "ns.toml"),
			`[points]\n"flow.submit.pr-description" = "${configuredRelativePath}"\n`,
			"utf8",
		);
		await writeFile(configuredPath, "configured prompt\n", "utf8");
		await writeFile(conventionalPath, "conventional prompt\n", "utf8");
		await writeFile(envPath, "environment prompt\n", "utf8");

		await expect(
			resolvePrDescriptionPrompt({
				env: { [PR_DESCRIPTION_PROMPT_ENV]: envPath },
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: true,
			text: "environment prompt\n",
			source: { type: "env", path: envPath },
		});
		await expect(
			resolvePrDescriptionPrompt({
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
			resolvePrDescriptionPrompt({
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
		const checkedInPackagedPrompt = readFlowPrDescriptionDefault();
		await expect(
			resolvePrDescriptionPrompt({
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
			resolvePrDescriptionPrompt({
				env: { [PR_DESCRIPTION_PROMPT_ENV]: "env.md" },
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
			resolvePrDescriptionPrompt({
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
		const selectedPath = join(repo, REPO_PR_DESCRIPTION_PROMPT_PATH);
		await mkdir(selectedPath, { recursive: true });

		const result = await resolvePrDescriptionPrompt({
			env: {},
			descriptorSource: flowExtensionDescriptorSource,
			repoRoot: repo,
		});
		expect(result).toMatchObject({
			ok: false,
			source: { type: "repo", path: selectedPath },
		});
		expect(result.ok ? "" : result.error).toContain(
			`Could not read selected ${REPO_PR_DESCRIPTION_PROMPT_PATH} at ${selectedPath}`,
		);
	});

	test("fails on an empty selected conventional prompt without using the packaged default", async () => {
		const repo = await createTemporaryRoot();
		const selectedPath = join(repo, REPO_PR_DESCRIPTION_PROMPT_PATH);
		await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
		await writeFile(selectedPath, " \n\t", "utf8");

		await expect(
			resolvePrDescriptionPrompt({
				env: {},
				descriptorSource: flowExtensionDescriptorSource,
				repoRoot: repo,
			}),
		).resolves.toEqual({
			ok: false,
			error: `Selected ${REPO_PR_DESCRIPTION_PROMPT_PATH} at ${selectedPath} is empty.`,
			source: { type: "repo", path: selectedPath },
		});
	});
});

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ns-flow-pr-description-"));
	temporaryRoots.push(root);
	return root;
}

async function installExplicitPromptWithConventionalFallback(
	repo: string,
	relativePath: string,
): Promise<void> {
	const conventionalPath = join(repo, ".ns", "prompts", "flow.submit.pr-description.md");
	await mkdir(join(repo, ".ns", "prompts"), { recursive: true });
	await writeFile(
		join(repo, "ns.toml"),
		`[points]\n"flow.submit.pr-description" = "${relativePath}"\n`,
		"utf8",
	);
	await writeFile(conventionalPath, "must not fall through to this prompt", "utf8");
}

import { describe, expect, test } from "bun:test";
import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import type { PendingWorktreeSnapshot } from "asdl-dev/src/pending-worktree.ts";
import { prepareAutobranchPlan, type AutobranchPreparationInput } from "../src/autobranch-preparation.ts";
import { MAX_BRANCH_SLUG_LENGTH } from "../src/branch-slug.ts";
import { buildSlugModelArgs } from "../src/model-slug.ts";
import { eventIndex, fail, ok } from "./autobranch-test-helpers.ts";

interface ExecCall {
	command: string;
	args: string[];
}

interface HarnessOptions {
	slug?: string;
	snapshot?: Partial<PendingWorktreeSnapshot>;
	piResult?: CommandResult;
	prepareResult?: { ok: true; message: string } | { ok: false; error: string };
	existingBranches?: Set<string>;
	invalidBranches?: Set<string>;
	untrackedFiles?: Record<string, string | Uint8Array>;
	untrackedListFails?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
	const calls: ExecCall[] = [];
	const events: string[] = [];
	const readPaths: string[] = [];
	const statPaths: string[] = [];
	const snapshot: PendingWorktreeSnapshot = {
		root: "/repo",
		branch: "feature/base",
		status: " M src/app.ts\n?? notes.txt\n",
		diff: "diff --git a/src/app.ts b/src/app.ts\n+updated app\n",
		clean: false,
		...options.snapshot,
	};
	const existingBranches = options.existingBranches ?? new Set<string>();
	const invalidBranches = options.invalidBranches ?? new Set<string>();
	const untrackedFiles = options.untrackedFiles ?? {};
	const prepareResult = options.prepareResult ?? { ok: true, message: "[cp] Update app\n\n- Add coverage" };

	const input: AutobranchPreparationInput = {
		cwd: "/repo",
		args: options.slug === undefined ? {} : { slug: options.slug },
		snapshot,
		exec: async (command, args) => {
			calls.push({ command, args });
			events.push(`exec:${command} ${args.join(" ")}`);
			if (command === "git" && args[0] === "ls-files") {
				return options.untrackedListFails ? fail("ls-files failed") : ok(Object.keys(untrackedFiles).join("\0"));
			}
			if (command === "pi") {
				return options.piResult ?? ok("model generated branch\n");
			}
			if (command === "git" && args[0] === "check-ref-format") {
				const branch = args.at(-1) ?? "";
				return invalidBranches.has(branch) ? fail("invalid ref") : ok();
			}
			if (command === "git" && args[0] === "show-ref") {
				const ref = args.at(-1) ?? "";
				const branch = ref.replace(/^refs\/heads\//, "");
				return existingBranches.has(branch) ? ok() : { code: 1, stdout: "", stderr: "" };
			}
			return ok();
		},
		prepareCheckpointMessage: async (preparedSnapshot) => {
			events.push("prepare");
			expect(preparedSnapshot.status).toBe(snapshot.status);
			expect(preparedSnapshot.diff).toBe(snapshot.diff);
			return prepareResult;
		},
		setStatus: (message) => {
			if (message) {
				events.push(`status:${message}`);
			}
		},
		readFile: async (path) => {
			readPaths.push(path);
			const basename = path.split("/").pop() ?? path;
			const content = untrackedFiles[basename];
			if (content === undefined) {
				throw new Error(`missing ${path}`);
			}
			return content;
		},
		stat: async (path) => {
			statPaths.push(path);
			const basename = path.split("/").pop() ?? path;
			const content = untrackedFiles[basename];
			return {
				size: typeof content === "string" ? Buffer.byteLength(content) : (content?.byteLength ?? 0),
				isFile: () => content !== undefined,
			};
		},
	};

	return { input, calls, events, readPaths, statPaths, snapshot };
}

function piCall(calls: ExecCall[]): ExecCall {
	const call = calls.find((candidate) => candidate.command === "pi");
	expect(call).toBeDefined();
	return call as ExecCall;
}

function piPrompt(calls: ExecCall[]): string {
	const call = piCall(calls);
	expect(call.args).toContain("--print");
	return call.args.at(-1) ?? "";
}

describe("prepareAutobranchPlan", () => {
	test("explicit valid slug returns requested plan without model or untracked reads", async () => {
		const harness = createHarness({ slug: "Test Branch" });

		const result = await prepareAutobranchPlan(harness.input);

		expect(result).toEqual({
			ok: true,
			plan: {
				branchName: "test-branch",
				baseSlug: "test-branch",
				slugSource: "requested",
				hasSuffix: false,
				checkpointMessage: "[cp] Update app\n\n- Add coverage",
			},
			warnings: [],
		});
		expect(harness.calls.some((call) => call.command === "pi")).toBe(false);
		expect(harness.calls.some((call) => call.command === "git" && call.args[0] === "ls-files")).toBe(false);
		expect(harness.readPaths).toEqual([]);
		expect(eventIndex(harness.events, "exec:git check-ref-format")).toBeLessThan(eventIndex(harness.events, "prepare"));
	});

	test("explicit invalid slug fails before branch checks or checkpoint preparation", async () => {
		const harness = createHarness({ slug: "---" });

		const result = await prepareAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "invalid_requested_slug", requestedSlug: "---" });
		expect(harness.calls.some((call) => call.command === "git" && call.args[0] === "check-ref-format")).toBe(false);
		expect(harness.calls.some((call) => call.command === "git" && call.args[0] === "show-ref")).toBe(false);
		expect(harness.events).not.toContain("prepare");
	});

	test("generated slug uses untracked snippets and sanitizes model output", async () => {
		const harness = createHarness({
			piResult: ok("```\nRefactor Slug_Prompt Plan!!!\n```\n"),
			untrackedFiles: { "notes.txt": "new idea from untracked file" },
		});

		const result = await prepareAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan).toMatchObject({
				branchName: "refactor-slug-prompt",
				baseSlug: "refactor-slug-prompt",
				slugSource: "model",
				hasSuffix: false,
			});
			expect(result.warnings).toEqual([]);
		}
		expect(harness.readPaths).toEqual(["/repo/notes.txt"]);
		expect(harness.statPaths).toEqual(["/repo/notes.txt"]);
		const prompt = piPrompt(harness.calls);
		expect(piCall(harness.calls).args).toEqual(buildSlugModelArgs(prompt));
		expect(prompt).toContain("## git status --porcelain\nM src/app.ts\n?? notes.txt");
		expect(prompt).toContain("## git diff HEAD\ndiff --git a/src/app.ts b/src/app.ts\n+updated app");
		expect(prompt).toContain("## untracked file contents\n## notes.txt\nnew idea from untracked file");
	});

	test("model failure falls back to changed paths and returns a non-fatal warning", async () => {
		const harness = createHarness({
			piResult: fail("model unavailable"),
			untrackedFiles: { "notes.txt": "new idea" },
		});

		const result = await prepareAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan).toMatchObject({
				branchName: "update-app-ts-notes-txt",
				baseSlug: "update-app-ts-notes-txt",
				slugSource: "fallback",
				hasSuffix: false,
			});
			expect(result.warnings).toEqual([{ kind: "slug_model_failed", fallbackSlug: "update-app-ts-notes-txt" }]);
		}
		expect(harness.events).toContain("prepare");
	});

	test("branch suffixing selects the first available candidate and trims long bases", async () => {
		const baseSlug = "a".repeat(MAX_BRANCH_SLUG_LENGTH);
		const suffixed = `${"a".repeat(MAX_BRANCH_SLUG_LENGTH - 2)}-2`;
		const harness = createHarness({
			slug: baseSlug,
			existingBranches: new Set([baseSlug]),
		});

		const result = await prepareAutobranchPlan(harness.input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.plan.branchName).toBe(suffixed);
			expect(result.plan.baseSlug).toBe(baseSlug);
			expect(result.plan.hasSuffix).toBe(true);
			expect(result.plan.branchName.length).toBe(MAX_BRANCH_SLUG_LENGTH);
		}
	});

	test("branch-name exhaustion returns typed failure", async () => {
		const existingBranches = new Set<string>();
		for (let index = 0; index < 50; index += 1) {
			const suffix = index === 0 ? "" : `-${index + 1}`;
			existingBranches.add(`busy${suffix}`);
		}
		const harness = createHarness({ slug: "busy", existingBranches });

		const result = await prepareAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "branch_name_unavailable", baseSlug: "busy" });
		expect(harness.events).not.toContain("prepare");
	});

	test("branch-name exhaustion handles invalid candidates", async () => {
		const invalidBranches = new Set<string>();
		for (let index = 0; index < 50; index += 1) {
			const suffix = index === 0 ? "" : `-${index + 1}`;
			invalidBranches.add(`invalid${suffix}`);
		}
		const harness = createHarness({ slug: "invalid", invalidBranches });

		const result = await prepareAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "branch_name_unavailable", baseSlug: "invalid" });
		expect(harness.events).not.toContain("prepare");
	});

	test("checkpoint preparation failure returns typed failure", async () => {
		const harness = createHarness({ slug: "test-branch", prepareResult: { ok: false, error: "checkpoint prep failed" } });

		const result = await prepareAutobranchPlan(harness.input);

		expect(result).toEqual({ ok: false, kind: "checkpoint_prepare_failed", error: "checkpoint prep failed" });
		expect(eventIndex(harness.events, "exec:git show-ref")).toBeLessThan(eventIndex(harness.events, "prepare"));
	});
});

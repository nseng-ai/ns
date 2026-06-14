import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildImplBranchContextPrompt,
	loadAttachedPlan,
	loadBranchContextPlan,
	normalizeRequestedBranchContextKey,
	selectAttachedPlanKey,
} from "../src/attached-plan.ts";
import { parseBrmemGetContent, parseBrmemListEntries, type AttachedPlanEntry, type BranchContextBrmemGateway } from "../src/brmem-gateway.ts";
import { BRANCH_CONTEXT_NAMESPACE, createBranchContextContext, type BranchContextContext } from "@asdl/branch-context";
import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import type { GitGateway } from "@asdl/core/git";
import { buildPlanFileName, buildRepoPlanStoreKey, encodeBranchForPlanPath } from "@asdl/plans";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_BRANCH = `branch-contexts/${PLAN_SLUG}`;
const PLAN_KEY = `${PLAN_SLUG}.md`;
const LEGACY_PLAN_KEY = "plan.md";
const PLAN_REF = `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${PLAN_BRANCH.replaceAll("/", "---")}:${PLAN_KEY}`;
const PLAN_CONTENT = "# Attached Plan\n\n- Preserve all Markdown.\n- Then implement.\n";
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

class FakePi implements CommandExecApi {
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if ("error" in expected) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

function gitCurrentBranchStep(branch: string = PLAN_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

function gitDefaultBranchStep(result: Partial<ExecResult> = { stdout: "origin/master\n" }): ScriptedExec {
	return step("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], result);
}

function gitBranchPresenceStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}`], result);
}

function gitDefaultBranchProbeSteps(result: Partial<ExecResult> = { stdout: "origin/master\n" }): ScriptedExec[] {
	const stdout = result.stdout ?? "origin/master\n";
	const candidate = stdout.trim().startsWith("origin/") ? stdout.trim().slice("origin/".length) : stdout.trim();
	if ((result.code ?? 0) === 0 && candidate.length > 0) {
		return [gitDefaultBranchStep(result), gitBranchPresenceStep(candidate)];
	}
	return [gitDefaultBranchStep(result), gitBranchPresenceStep("main", { code: 1, stderr: "missing" }), gitBranchPresenceStep("master", { code: 1, stderr: "missing" })];
}

function brmemListStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["list", "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function brmemGetStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function listEnvelope(
	branch: string,
	entries: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>,
): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: null,
			branch,
			base: false,
			entries: entries.map((entry) => {
				const entryBranch = entry.branch ?? branch;
				return {
					namespace: entry.namespace ?? BRANCH_CONTEXT_NAMESPACE,
					key: entry.key,
					branch: entryBranch,
					ref_name: entry.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${entryBranch.replaceAll("/", "---")}:${entry.key}`,
				};
			}),
		},
	});
}

function getEnvelope(input: { key: string; branch: string; content: string; refName?: string; namespace?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: input.namespace ?? BRANCH_CONTEXT_NAMESPACE,
			key: input.key,
			branch: input.branch,
			content: input.content,
			ref_name: input.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			target: input.refName ?? `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			at: null,
		},
	});
}

function successfulLoadScript(input: {
	branch?: string;
	key?: string;
	entries?: Array<{ key: string; branch?: string; namespace?: string; refName?: string }>;
	content?: string;
	refName?: string;
	defaultBranchResult?: Partial<ExecResult>;
} = {}): ScriptedExec[] {
	const branch = input.branch ?? PLAN_BRANCH;
	const key = input.key ?? PLAN_KEY;
	const entries = input.entries ?? (input.refName === undefined ? [{ key }] : [{ key, refName: input.refName }]);
	const content = input.content ?? PLAN_CONTENT;
	const getStdout = input.refName === undefined ? getEnvelope({ branch, key, content }) : getEnvelope({ branch, key, content, refName: input.refName });
	return [
		gitRootStep(),
		gitCurrentBranchStep(branch),
		...gitDefaultBranchProbeSteps(input.defaultBranchResult ?? { stdout: "origin/master\n" }),
		brmemListStep(branch, { stdout: listEnvelope(branch, entries) }),
		brmemGetStep(branch, key, { stdout: getStdout }),
	];
}

function attachedPlanEntry(key: string, branch: string = PLAN_BRANCH): AttachedPlanEntry {
	return {
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key,
		branch,
		refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`,
	};
}

function fakeGitGateway(branch: string = PLAN_BRANCH): GitGateway {
	return {
		async repoRoot() {
			return { ok: true, value: ROOT };
		},
		async optionalRepoRoot() {
			return { type: "found", value: ROOT };
		},
		async currentBranch() {
			return { ok: true, value: branch };
		},
		async trunkBranch() {
			return { type: "found", value: "main" };
		},
		async originUrl() {
			return { type: "found", value: "git@github.com:asdl/asdl-tools.git" };
		},
		async headCommit() {
			return { ok: true, value: "1111111111111111111111111111111111111111" };
		},
		async validateBranchRef() {
			return { ok: true };
		},
		async localBranchPresence() {
			return { type: "absent", refName: `refs/heads/${branch}` };
		},
		async createBranchAtHead() {
			return { ok: true };
		},
	};
}

function branchContext(pi: CommandExecApi, overrides: Partial<BranchContextContext> = {}): BranchContextContext {
	return { ...createBranchContextContext(pi), ...overrides };
}

function emptyBrmemGateway(): BranchContextBrmemGateway {
	return {
		async attachmentPresence() {
			return { type: "absent" };
		},
		async attachPlan() {
			return { ok: false, error: { code: "unexpected", message: "attachPlan should not be called" } };
		},
		async listAttachedPlans() {
			return { ok: true, value: [] };
		},
		async getAttachedPlan() {
			return { ok: false, error: { code: "unexpected", message: "getAttachedPlan should not be called" } };
		},
		async deleteEntry() {
			return { ok: false, error: { code: "unexpected", message: "deleteEntry should not be called" } };
		},
	};
}

describe("loadAttachedPlan", () => {
	test("loads the branch-segment attached plan and preserves full content", async () => {
		const pi = new FakePi(successfulLoadScript({ refName: PLAN_REF }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) });

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", "refs/heads/master"] },
			{ command: "brmem", args: ["list", "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", PLAN_BRANCH, "--format", "json"] },
			{ command: "brmem", args: ["get", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", PLAN_BRANCH, "--format", "json"] },
		]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});
	});

	test("loads a single legacy plan.md entry without an explicit key", async () => {
		const pi = new FakePi(successfulLoadScript({ key: LEGACY_PLAN_KEY }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) });

		pi.assertDone();
		expect(plan.selectedKey).toBe(LEGACY_PLAN_KEY);
	});

	test("loads an explicit exact key", async () => {
		const exactPi = new FakePi(successfulLoadScript());
		const exactPlan = await loadAttachedPlan(exactPi, { requestedKey: PLAN_KEY }, { cwd: ROOT, context: branchContext(exactPi) });
		exactPi.assertDone();
		expect(exactPlan.selectedKey).toBe(PLAN_KEY);
	});

	test("reports ambiguous no-key selection with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: "branch-contexts/no-match",
				entries: [attachedPlanEntry("beta.md"), attachedPlanEntry("alpha.md")],
			}),
		).toThrow(/Multiple branch-context entries[\s\S]*Pass an explicit branch-context key[\s\S]*- alpha\.md[\s\S]*- beta\.md/);
	});

	test("reports missing requested key with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: PLAN_BRANCH,
				requestedKey: "missing",
				entries: [attachedPlanEntry("alpha.md"), attachedPlanEntry("beta.md")],
			}),
		).toThrow(/Requested branch-context key `missing`[\s\S]*- alpha\.md[\s\S]*- beta\.md/);
	});

	test("rejects invalid requested keys before command selection", () => {
		expect(() => normalizeRequestedBranchContextKey("   ")).toThrow("empty");
		expect(() => normalizeRequestedBranchContextKey("/abs.md")).toThrow("must not start");
		expect(() => normalizeRequestedBranchContextKey("../escape")).toThrow("must not contain");
	});

	test("reports no entries with recovery guidance", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			...gitDefaultBranchProbeSteps(),
			brmemListStep(PLAN_BRANCH, { stdout: listEnvelope(PLAN_BRANCH, []) }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(/No branch-context entries[\s\S]*enriched-plan exec save[\s\S]*branch-context exec from-plan/);

		pi.assertDone();
	});

	test("loads saved-plan fallback content with an injected text reader", async () => {
		const planStoreRoot = await mkdtemp(join(tmpdir(), "branch-context-fallback-"));
		tempDirs.push(planStoreRoot);
		const savedSlug = "saved-plan-fallback-content";
		const fileName = buildPlanFileName(savedSlug);
		const directory = join(planStoreRoot, buildRepoPlanStoreKey(ROOT, "git@github.com:asdl/asdl-tools.git"), encodeBranchForPlanPath(PLAN_BRANCH));
		const filePath = join(directory, fileName);
		await mkdir(directory, { recursive: true });
		await writeFile(filePath, "# Real file should not be read\n", "utf8");
		const fakeContent = "# Injected Saved Plan\n\nUse this reader-supplied content.\n";
		const readPaths: string[] = [];
		const pi = new FakePi();

		const plan = await loadBranchContextPlan(pi, {}, {
			cwd: ROOT,
			context: branchContext(pi, { git: fakeGitGateway(), brmem: emptyBrmemGateway() }),
			planStoreRoot,
			async readTextFile(path) {
				readPaths.push(path);
				return fakeContent;
			},
		});

		pi.assertDone();
		expect(readPaths).toEqual([filePath]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: "local-plan-store",
			selectedKey: fileName,
			refName: filePath,
			content: fakeContent,
			byteCount: new TextEncoder().encode(fakeContent).length,
			availableKeys: [fileName],
			source: "saved",
			sourceFile: filePath,
		});
	});

	test("refuses detached HEAD before Branch Memory reads", async () => {
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep("", { code: 1, stderr: "fatal: ref HEAD is not a symbolic ref" })]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow("detached HEAD");

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("refuses trunk branches before Branch Memory reads", async () => {
		for (const branch of ["main", "master", "develop"]) {
			const pi = new FakePi([
				gitRootStep(),
				gitCurrentBranchStep(branch),
				...gitDefaultBranchProbeSteps({ stdout: branch === "develop" ? "origin/develop\n" : "origin/main\n" }),
			]);

			await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(
				`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`,
			);

			pi.assertDone();
			expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		}
	});

	test("continues when default branch lookup fails on a feature branch", async () => {
		const pi = new FakePi(successfulLoadScript({ defaultBranchResult: { code: 1, stderr: "no origin" } }));

		const plan = await loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) });

		pi.assertDone();
		expect(plan.selectedKey).toBe(PLAN_KEY);
	});

	test("formats brmem list process failures", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			...gitDefaultBranchProbeSteps(),
			brmemListStep(PLAN_BRANCH, { code: 2, stderr: "list failed" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(/brmem list failed[\s\S]*Command: brmem list/);

		pi.assertDone();
	});

	test("reports unavailable brmem list without attempting get", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			...gitDefaultBranchProbeSteps(),
			brmemListStep(PLAN_BRANCH, { code: 127, stderr: "brmem: command not found" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow("No brmem command available");

		pi.assertDone();
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "get")).toBe(false);
	});

	test("formats brmem get process failures", async () => {
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(),
			...gitDefaultBranchProbeSteps(),
			brmemListStep(PLAN_BRANCH, { stdout: listEnvelope(PLAN_BRANCH, [{ key: PLAN_KEY }]) }),
			brmemGetStep(PLAN_BRANCH, PLAN_KEY, { code: 2, stderr: "get failed" }),
		]);

		await expect(loadAttachedPlan(pi, {}, { cwd: ROOT, context: branchContext(pi) })).rejects.toThrow(/brmem get failed[\s\S]*Command: brmem get/);

		pi.assertDone();
	});
});

describe("attached-plan JSON parsers", () => {
	test("rejects malformed list JSON, missing entries, and mismatched entries", () => {
		expect(() => parseBrmemListEntries("{", { namespace: BRANCH_CONTEXT_NAMESPACE, branch: PLAN_BRANCH })).toThrow(
			"Malformed brmem list JSON",
		);
		expect(() => parseBrmemListEntries(JSON.stringify({ exit_code: 0, data: {} }), { namespace: BRANCH_CONTEXT_NAMESPACE, branch: PLAN_BRANCH })).toThrow(
			"expected data.entries array",
		);
		expect(() =>
			parseBrmemListEntries(listEnvelope(PLAN_BRANCH, [{ key: PLAN_KEY, namespace: "other" }]), {
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: PLAN_BRANCH,
			}),
		).toThrow("expected canonical entry");
	});

	test("rejects malformed get JSON, missing content, and mismatched data", () => {
		expect(() => parseBrmemGetContent("{", { namespace: BRANCH_CONTEXT_NAMESPACE, branch: PLAN_BRANCH, key: PLAN_KEY })).toThrow(
			"Malformed brmem get JSON",
		);
		expect(() =>
			parseBrmemGetContent(JSON.stringify({ exit_code: 0, data: { namespace: BRANCH_CONTEXT_NAMESPACE, key: PLAN_KEY, branch: PLAN_BRANCH } }), {
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: PLAN_BRANCH,
				key: PLAN_KEY,
			}),
		).toThrow("expected string fields");
		expect(() =>
			parseBrmemGetContent(getEnvelope({ key: "other.md", branch: PLAN_BRANCH, content: PLAN_CONTENT }), {
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: PLAN_BRANCH,
				key: PLAN_KEY,
			}),
		).toThrow("expected requested data");
	});
});

describe("buildImplBranchContextPrompt", () => {
	test("includes evidence and untruncated plan content", () => {
		const prompt = buildImplBranchContextPrompt({
			branch: PLAN_BRANCH,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});

		expect(prompt).toContain("The attached branch-context plan has been loaded by the planning-layer reader.");
		expect(prompt).toContain(`Branch: ${PLAN_BRANCH}`);
		expect(prompt).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(prompt).toContain(`Selected key: ${PLAN_KEY}`);
		expect(prompt).toContain(`Ref: ${PLAN_REF}`);
		expect(prompt).toContain(`Bytes: ${new TextEncoder().encode(PLAN_CONTENT).length}`);
		expect(prompt).toContain("Create an implementation checklist");
		expect(prompt).toContain("Do not call `brmem put`, `brmem copy`, `brmem delete`");
		expect(prompt).toContain("## Branch-context plan contract protocol");
		expect(prompt).toContain("manually compare the excerpts against live repo state before step 1");
		expect(prompt).toContain("old-format/pre-contract");
		expect(prompt).toContain("verification gate fails twice after reasonable local attempts");
		expect(prompt).toContain("STOP report shape: observed vs expected");
		expect(prompt).toContain("intentional executor edits outside scope are a failure");
		expect(prompt).toContain(`----- BEGIN ATTACHED PLAN -----\n${PLAN_CONTENT}\n----- END ATTACHED PLAN -----`);
	});
});

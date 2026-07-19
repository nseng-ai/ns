import { rmSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { fakeStackInfo } from "@nseng-ai/capability-kit/graphite/testing";
import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import {
	PR_DESCRIPTION_GENERATOR_VERSION,
	formatManagedGeneratedRegion,
	hashPrDescriptionPrompt,
} from "../../src/submit/index.ts";
import { FLOW_SUBMIT_CHECK_FAILURE_MARKER } from "../../src/submit/submit-hooks.ts";

import { runFlowSubmitCommandWithFakes } from "./flow-command-fakes.ts";
import { writeTestPointManifest } from "../support/point-manifest.ts";
import { readFlowPrDescriptionDefault } from "../support/pr-description.ts";
import { formattedExecCalls, type ScriptedExecResponse } from "./ns-cli-fakes.ts";

// A non-tty transient progress line, as routed to onOutput (the Pi widget path / captured liveOutput).
function transient(text: string): { stream: "stderr"; text: string } {
	return { stream: "stderr", text: `${text}\n` };
}

function expectPlainHostedOutput(
	entries: readonly { stream: "stdout" | "stderr"; text: string }[],
): void {
	for (const entry of entries) {
		expect(entry.text).toBe(stripAnsi(entry.text));
		expect(entry.text).not.toContain("\r");
	}
}

function lastStderrOutput(
	entries: readonly { stream: "stdout" | "stderr"; text: string }[],
): string {
	return entries.findLast((entry) => entry.stream === "stderr")?.text ?? "";
}

const PR_URL = "https://github.com/acme/repo/pull/123";
const GRAPHITE_PR_URL = "https://app.graphite.com/github/pr/acme/repo/123";
const LAGGING_VERIFICATION_PR_URL = "https://app.graphite.com/github/pr/dagster-io/sdl-tools/1517";
const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function runWithFakes(options: Parameters<typeof runFlowSubmitCommandWithFakes>[0] = {}) {
	return runFlowSubmitCommandWithFakes({
		...options,
		defaults: {
			execResponses: successfulSubmitResponses,
			textGenerationResults: () => [{ ok: true, text: defaultPrDescriptionText() }],
			missingTextGenerationResult: () => ({ ok: true, text: defaultPrDescriptionText() }),
		},
	});
}

function cleanCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
	];
}

function dirtyCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Submit checkpoint\n" } },
	];
}

function minimalSubmitResponses(
	options: { shouldForce?: boolean; shouldRestack?: boolean; headAfter?: string } = {},
): ScriptedExecResponse[] {
	const headBefore = "a".repeat(40);
	const headAfter = options.headAfter ?? headBefore;
	const remoteBefore = "b".repeat(40);
	const submitCommand = options.shouldForce
		? "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force"
		: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web";
	const observationCommand =
		"git for-each-ref --format=%(refname:short)%00%(objectname)%00%(upstream) refs/heads/feature/demo";
	const inspect = (head: string): ScriptedExecResponse[] => [
		{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
		{ match: "git rev-parse HEAD", result: { stdout: `${head}\n` } },
		{ match: "git status --porcelain=v1 -z", result: { stdout: "" } },
	];
	return [
		...inspect(headBefore),
		...inspect(headBefore),
		...inspect(headBefore),
		{
			match: observationCommand,
			result: {
				stdout: `feature/demo\0${headBefore}\0refs/remotes/origin/feature/demo\n`,
			},
		},
		{
			match: "git show-ref --verify refs/remotes/origin/feature/demo",
			result: { stdout: `${remoteBefore} refs/remotes/origin/feature/demo\n` },
		},
		...(options.shouldRestack === true
			? [
					{
						match: `${submitCommand} --dry-run`,
						result: { code: 1, stderr: "branch must be restacked before submitting\n" },
					},
					{
						match: "gt restack --downstack --no-interactive",
						result: { stdout: "restacked\n" },
					},
					{ match: `${submitCommand} --dry-run`, result: { stdout: "ready\n" } },
				]
			: [{ match: `${submitCommand} --dry-run`, result: { stdout: "ready\n" } }]),
		{ match: submitCommand, result: { stdout: `Submitted ${PR_URL}\n` } },
		{
			match: "gh pr view --json number,url",
			result: { stdout: prIdentityJson(123, PR_URL) },
		},
		...inspect(headAfter),
		{
			match: observationCommand,
			result: {
				stdout: `feature/demo\0${headAfter}\0refs/remotes/origin/feature/demo\n`,
			},
		},
		{
			match: "git show-ref --verify refs/remotes/origin/feature/demo",
			result: { stdout: `${headAfter} refs/remotes/origin/feature/demo\n` },
		},
	];
}

function successfulSubmitResponses(
	options: { shouldForce?: boolean; existingPrBody?: string } = {},
): ScriptedExecResponse[] {
	const submitCommand = options.shouldForce
		? "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force"
		: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web";
	const submitDryRunCommand = `${submitCommand} --dry-run`;
	return [
		...cleanCheckpointResponses(),
		{
			match: submitDryRunCommand,
			result: { stdout: "ready\n" },
		},
		{
			match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
			result: { stdout: prIdentityListJson(123, PR_URL) },
		},
		{
			match: submitCommand,
			result: { stdout: `Submitted ${PR_URL}\n` },
		},
		{
			match: "gh pr view --json number,url",
			result: { stdout: prIdentityJson(123, PR_URL) },
		},
		{
			match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: options.existingPrBody ?? "Hand edited body" }) },
		},
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
	];
}

function prIdentityListJson(number: number, url: string): string {
	return JSON.stringify([{ number, url }]);
}

function prIdentityJson(number: number, url: string): string {
	return JSON.stringify({ number, url });
}

function prJson(
	options: { body: string; title?: string; headRefName?: string } = { body: "" },
): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: options.title ?? "Existing PR title",
		body: options.body,
		headRefName: options.headRefName ?? "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(): string {
	return JSON.stringify({
		commits: [{ messageHeadline: "Add submit", messageBody: "Body from commit" }],
	});
}

function defaultPrDescriptionText(): string {
	return "Generated PR\n\nGenerated body";
}

async function createSubmitHooksRepo(preSubmit: readonly string[]): Promise<string> {
	const repoRoot = await mkdtemp(join(tmpdir(), "ns-submit-hooks-test-"));
	tempDirs.push(repoRoot);
	await writeTestPointManifest(repoRoot, {
		group: "flow",
		points: [
			{
				path: ["submit", "pre"],
				accepts: "hook",
				cardinality: "many",
				description: "Runs before submit.",
			},
		],
	});
	await writeFile(
		join(repoRoot, "ns.toml"),
		`extensions = ["./extensions/flow"]\n\n[models.profiles]\nfast = "openai-codex/gpt-5.6-luna"\n\n[points]\n"flow.submit.pre" = ${JSON.stringify(preSubmit)}\n`,
		"utf8",
	);
	return repoRoot;
}

describe("project-local submit extension", () => {
	test("keeps generated HOME, XDG state, and submit logs outside the checkout", async () => {
		const checkout = await mkdtemp(join(tmpdir(), "ns-submit-checkout-"));
		tempDirs.push(checkout);
		const run = runWithFakes({ cwd: checkout, request: { minimal: true } });

		await run.exit;

		for (const key of ["HOME", "XDG_STATE_HOME", "NS_SUBMIT_FAILURE_LOG_DIR"] as const) {
			const generatedRoot = run.context.env[key];
			expect(generatedRoot).toBeDefined();
			expect(generatedRoot?.startsWith(`${checkout}/`)).toBe(false);
		}
	});

	test("live non-TTY progress drives the structured submit matrix through the actual command handler", async () => {
		const events: NsProgressPhaseEvent[] = [];
		const progress: NsProgress = {
			isLive: true,
			phase: (event) => events.push(event),
		};
		const run = runWithFakes({
			progress,
			request: { verbose: true },
			state: { exec: successfulSubmitResponses() },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const declaration = events.find((event) => event.type === "matrix-declared");
		expect(declaration).toEqual({
			type: "matrix-declared",
			labelHeader: "Branch / PR",
			columns: [
				{ key: "metadata", label: "Metadata", width: 8 },
				{ key: "description", label: "Description", width: 11 },
			],
		});
		const phaseDeclaration = events.find((event) => event.type === "phases-declared");
		if (phaseDeclaration?.type !== "phases-declared") throw new Error("phase declaration missing");
		expect(phaseDeclaration.phases.map((phase) => phase.key)).toEqual([
			"inventory",
			"checkpoint",
			"preflight",
			"restack",
			"metadata",
			"submit",
			"verification",
			"descriptions",
		]);
		expect(
			phaseDeclaration.phases
				.find((phase) => phase.key === "checkpoint")
				?.substeps?.map((phase) => phase.key),
		).toEqual(["inspect", "generate", "commit"]);
		const inventoryActiveIndex = events.findIndex(
			(event) => event.type === "phase-started" && event.phaseKey === "inventory",
		);
		const rowsIndex = events.findIndex((event) => event.type === "matrix-rows");
		const inventoryDoneIndex = events.findIndex(
			(event) => event.type === "phase-done" && event.phaseKey === "inventory",
		);
		expect(inventoryActiveIndex).toBeGreaterThanOrEqual(0);
		expect(rowsIndex).toBeGreaterThan(inventoryActiveIndex);
		expect(inventoryDoneIndex).toBeGreaterThan(rowsIndex);
		expect(events[rowsIndex]).toEqual({
			type: "matrix-rows",
			rows: [{ rowKey: "feature/demo", label: "feature/demo (#123)" }],
		});
		expect(events).toEqual(
			expect.arrayContaining([
				{ type: "phase-started", phaseKey: "inspect" },
				{
					type: "matrix-cell",
					rowKey: "feature/demo",
					columnKey: "metadata",
					state: "skipped",
					text: "exists",
				},
				{
					type: "matrix-cell",
					rowKey: "feature/demo",
					columnKey: "description",
					state: "skipped",
					text: "existing description",
				},
				{ type: "phase-done", phaseKey: "preflight", detail: "ready to submit" },
				{ type: "phase-done", phaseKey: "restack", detail: "not required" },
				{ type: "phase-done", phaseKey: "submit", detail: "stack submitted" },
				{ type: "phase-done", phaseKey: "verification", detail: "current PR verified (#123)" },
				{ type: "matrix-active-operations", operations: [] },
			]),
		);
		const commandDisplays = events.flatMap((event) =>
			event.type === "matrix-active-operations"
				? event.operations.flatMap((operation) =>
						operation.kind === "command" ? [operation.display] : [],
					)
				: [],
		);
		expect(commandDisplays).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(events.at(-1)).toEqual({
			type: "phase-done",
			phaseKey: "descriptions",
			detail: "descriptions ready",
		});
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: "ready\n" });
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: `Submitted ${PR_URL}\n` });
		expect(run.liveOutput.some((entry) => entry.text.includes("ns flow submit"))).toBe(false);
	});

	test("non-live non-TTY progress stays on the settled stream without matrix events", async () => {
		const progress: NsProgress = {
			isLive: false,
			phase: () => {
				throw new Error("non-live progress must not receive matrix events");
			},
		};
		const run = runWithFakes({ progress });

		expect(await run.exit).toBe(0);
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("ns flow submit");
		expect(settled).toContain("checkpoint complete");
		expect(settled).not.toContain("Branch / PR");
	});

	test("clean success with --regenerate-descriptions submits, verifies current PR, prints quiet progress, and rewrites PR bodies", async () => {
		const run = runWithFakes({
			request: { regenerateDescriptions: true },
			state: {
				textGeneration: [
					{
						ok: true,
						text: defaultPrDescriptionText(),
						usage: { inputTokens: 1234, outputTokens: 56 },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain(`✓ #123 ${PR_URL}`);
		expect(output).toContain("description updated");
		expect(output).toContain("new title: Generated PR");
		expect(output).toContain("new description: Generated body");
		expect(output).not.toContain("gt submit succeeded");
		expect(output).not.toContain("PRs:");
		expect(output).not.toContain("Updated PR descriptions after submit");
		expect(run.stderr.join("")).toBe("");
		expectPlainHostedOutput(run.liveOutput);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("checkpointing pending changes…"),
				transient("inspecting worktree…"),
				transient("checking submit readiness…"),
				transient("inspecting stack and preparing PR metadata if needed…"),
				transient(
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
				),
				transient("checking current PR"),
				transient("checking 1 PR description for skip or regeneration"),
				transient("preparing descriptions for 1 PR"),
				transient("loading PR #123 metadata (1/1)"),
				transient("resolving PR description prompt and model"),
				transient("checking PR #123 description fingerprint"),
				transient("recomputing PR #123 description (no generated fingerprint found)"),
				transient("generating PR metadata (attempt 1/2)"),
				transient("PR metadata generated (tokens in 1234, out 56)"),
				transient("updating PR #123 description"),
				transient("finished PR #123 description"),
			]),
		);
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("ns flow submit");
		expect(settled).toContain("checkpoint complete");
		expect(settled).toContain("✓ Inspect");
		expect(settled).toContain("worktree inspected");
		expect(settled).toContain("– Generate");
		expect(settled).toContain("checkpoint message ready");
		expect(settled).toContain("– Commit");
		expect(settled).toContain("checkpoint committed");
		expect(settled).toContain("ready to submit");
		expect(settled).toContain("metadata prepared");
		expect(settled).toContain("stack submitted");
		expect(settled).toContain("PRs verified");
		expect(settled).toContain("descriptions ready");
		// The gt submit phase streams its raw output live even without --verbose.
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: `Submitted ${PR_URL}\n` });
		// Preflight dry-run output stays quiet unless --verbose is passed.
		expect(run.liveOutput).not.toContainEqual({ stream: "stdout", text: "ready\n" });
		const calls = formattedExecCalls(run.context);
		expect(calls).toContain("gh pr view --json number,url");
		expect(calls).not.toContain("gt branch info --no-interactive");
		expect(calls).not.toContain("gt log --stack --reverse --no-interactive");
		expect(
			calls.indexOf("gh pr list --head feature/demo --state open --limit 2 --json number,url"),
		).toBeGreaterThan(
			calls.indexOf(
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			),
		);
		expect(run.stackGateway.operations()).toEqual([{ type: "stack", cwd: "/work" }]);
		expect(formattedExecCalls(run.context)).toContain("gh pr diff 123");
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Generated PR --body-file /),
		);
	});

	test("clean success preserves a non-empty existing PR description by default", async () => {
		const run = runWithFakes();

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain(`✓ #123 ${PR_URL}`);
		expect(output).not.toContain("description updated");
		expect(formattedExecCalls(run.context)).toContain(
			"gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
		);
		expect(formattedExecCalls(run.context)).not.toContain("gh pr view 123 --json commits");
		expect(run.liveOutput).toContainEqual(
			transient("skipping PR #123 description; existing PR body is not empty"),
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("clean success generates a description for an empty existing PR by default", async () => {
		const run = runWithFakes({
			state: { exec: successfulSubmitResponses({ existingPrBody: "" }) },
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("description updated");
		expect(output).toContain("new title: Generated PR");
		expect(formattedExecCalls(run.context)).toContain("gh pr view 123 --json commits");
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Generated PR --body-file /),
		);
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});

	test("--verbose streams raw Graphite output in addition to concise progress", async () => {
		const run = runWithFakes({ request: { verbose: true } });

		expect(await run.exit).toBe(0);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("checking submit readiness…"),
				{ stream: "stdout", text: "ready\n" },
				transient(
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
				),
				{ stream: "stdout", text: `Submitted ${PR_URL}\n` },
			]),
		);
	});

	test("minimal mode ignores malformed submit-hook configuration and runs no hook, checkpoint, metadata, or model work", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "ns-minimal-submit-test-"));
		tempDirs.push(repoRoot);
		await writeFile(
			join(repoRoot, "ns.toml"),
			'extensions = ["./extensions/flow"]\n\n[points]\n"flow.submit.pre" = 42\n',
			"utf8",
		);
		const run = runWithFakes({
			cwd: repoRoot,
			request: { minimal: true },
			state: { exec: minimalSubmitResponses(), textGeneration: [] },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		expect(run.stdout.join("")).toContain("Submitted 1 Graphite branch with minimal submit");
		expect(run.context.textGeneratorCalls).toEqual([]);
		const calls = formattedExecCalls(run.context);
		expect(calls).not.toContain("just");
		expect(calls).not.toContain("git add -A");
		expect(calls.every((call) => !call.startsWith("gh pr list"))).toBe(true);
		expect(calls.every((call) => !call.startsWith("gt modify"))).toBe(true);
		expect(calls.every((call) => !call.startsWith("gh pr edit"))).toBe(true);
	});

	test("minimal dirty refusal occurs before any Graphite command", async () => {
		const run = runWithFakes({
			request: { minimal: true },
			state: {
				exec: [
					{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
					{ match: "git rev-parse HEAD", result: { stdout: `${"a".repeat(40)}\n` } },
					{
						match: "git status --porcelain=v1 -z",
						result: { stdout: " M src/app.ts\0" },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Minimal submit requires a clean worktree");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt "))).toBe(false);
	});

	test("minimal mode automatically restacks and rechecks before submit", async () => {
		const restackedHead = "c".repeat(40);
		const run = runWithFakes({
			request: { minimal: true },
			state: {
				exec: minimalSubmitResponses({ shouldRestack: true, headAfter: restackedHead }),
			},
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const calls = formattedExecCalls(run.context);
		expect(calls).toContain("gt restack --downstack --no-interactive");
		expect(calls.filter((call) => call.endsWith("--dry-run"))).toHaveLength(2);
		expect(run.stdout.join("")).toContain(`feature/demo@${restackedHead}`);
	});

	test("minimal mode omits Graphite --force by default and preserves explicit --force", async () => {
		const defaultRun = runWithFakes({
			request: { minimal: true },
			state: { exec: minimalSubmitResponses() },
		});
		expect(await defaultRun.exit, defaultRun.stderr.join("")).toBe(0);
		expect(
			formattedExecCalls(defaultRun.context).filter((call) => call.startsWith("gt submit")),
		).toEqual([
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		]);

		const forceRun = runWithFakes({
			request: { minimal: true, force: true },
			state: { exec: minimalSubmitResponses({ shouldForce: true }) },
		});
		expect(await forceRun.exit, forceRun.stderr.join("")).toBe(0);
		expect(formattedExecCalls(forceRun.context)).toEqual(
			expect.arrayContaining([
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force --dry-run",
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force",
			]),
		);
	});

	test("minimal --verbose forwards raw readiness, submit, and verification output", async () => {
		const run = runWithFakes({
			request: { minimal: true, verbose: true },
			state: { exec: minimalSubmitResponses() },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				{ stream: "stdout", text: "ready\n" },
				{ stream: "stdout", text: `Submitted ${PR_URL}\n` },
			]),
		);
	});

	test("minimal mode rejects PR-description regeneration before any command", async () => {
		const run = runWithFakes({
			request: { minimal: true, regenerateDescriptions: true },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"--minimal cannot be combined with --regenerate-descriptions",
		);
		expect(await run.result).toMatchObject({
			type: "usageError",
			data: { conflictingOptions: ["--minimal", "--regenerate-descriptions"] },
		});
		expect(formattedExecCalls(run.context)).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("configured pre-submit check runs before checkpoint and submit", async () => {
		const repoRoot = await createSubmitHooksRepo(["just"]);
		const run = runWithFakes({
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: `${repoRoot}\n` } },
					{ match: "just", result: { stdout: "hooks ok\n" } },
					...successfulSubmitResponses(),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.liveOutput).toContainEqual(transient("running just…"));
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: "hooks ok\n" });
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("pre-submit checks passed");
		expect(settled).toContain("checkpoint complete");
		const calls = formattedExecCalls(run.context);
		expect(calls.indexOf("just")).toBeGreaterThanOrEqual(0);
		expect(
			calls.indexOf(
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			),
		).toBeGreaterThan(calls.indexOf("just"));
	});

	test("failing pre-submit check aborts submit with deterministic failure output", async () => {
		const repoRoot = await createSubmitHooksRepo(["just"]);
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-hook-failure-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: `${repoRoot}\n` } },
					{
						match: "just",
						result: { code: 7, stdout: "hook stdout\n", stderr: "hook stderr\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		const result = await run.result;
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.data).toEqual({ exitCode: 7 });
			expect(result.message.split("\n")[0]).toBe(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
		}
		const error = run.stderr.join("");
		expect(error.split("\n")[0]).toBe(`error: ${FLOW_SUBMIT_CHECK_FAILURE_MARKER}`);
		expect(error.split(FLOW_SUBMIT_CHECK_FAILURE_MARKER)).toHaveLength(2);
		expect(error).toContain("Pre-submit check failed (exit code 7).");
		expect(error).toContain("Command: just");
		expect(error).toContain("Submission was not attempted.");
		expect(error).toContain("hook stdout");
		expect(error).toContain("hook stderr");
		expect(error).toContain(
			"Fix the failure, or rerun with --no-checks to skip pre-submit checks.",
		);
		expect(error).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(run.liveOutput).toContainEqual({ stream: "stdout", text: "hook stdout\n" });
		expect(run.liveOutput).toContainEqual({ stream: "stderr", text: "hook stderr\n" });
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("✗ Checks");
		expect(settled).toContain("checks failed");
		expect(formattedExecCalls(run.context)).not.toContain("git symbolic-ref --short HEAD");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
	});

	test("pre-submit check exit 1 remains a negative result with the raw marker line", async () => {
		const repoRoot = await createSubmitHooksRepo(["just"]);
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-check-negative-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: `${repoRoot}\n` } },
					{ match: "just", result: { code: 1, stderr: "check failed\n" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		const result = await run.result;
		expect(result.type).toBe("negative");
		if (result.type === "negative") {
			expect(result.data).toEqual({ exitCode: 1 });
			expect(result.message.split("\n")[0]).toBe(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
		}
		const error = run.stderr.join("");
		expect(error.split("\n")[0]).toBe(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
		expect(error.split(FLOW_SUBMIT_CHECK_FAILURE_MARKER)).toHaveLength(2);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(formattedExecCalls(run.context)).not.toContain("git symbolic-ref --short HEAD");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
	});

	test("checks: false skips configured pre-submit checks", async () => {
		const repoRoot = await createSubmitHooksRepo(["just"]);
		await writeFile(
			join(repoRoot, "ns.toml"),
			'[models.profiles]\nfast = "openai-codex/gpt-5.6-luna"\n',
			"utf8",
		);
		const run = runWithFakes({
			cwd: repoRoot,
			request: { checks: false },
			state: { exec: successfulSubmitResponses() },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		expect(formattedExecCalls(run.context)).not.toContain("just");
		expect(run.liveOutput).not.toContainEqual(transient("running just…"));
		expect(lastStderrOutput(run.liveOutput)).not.toContain("pre-submit checks passed");
	});

	test("--force passes --force to Graphite submit readiness and submit", async () => {
		const run = runWithFakes({
			request: { force: true },
			state: { exec: successfulSubmitResponses({ shouldForce: true }) },
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force --dry-run",
		);
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --force",
		);
	});

	test("matching PR description fingerprint skips model generation and PR edits", async () => {
		const managedBody = formatManagedGeneratedRegion("Generated body", {
			version: "2",
			patchId: "default-patch-id",
			promptHash: hashPrDescriptionPrompt(readFlowPrDescriptionDefault()),
			generator: PR_DESCRIPTION_GENERATOR_VERSION,
		});
		const run = runWithFakes({
			request: { regenerateDescriptions: true },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match: "gh pr view --json number,url",
						result: { stdout: prIdentityJson(123, PR_URL) },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: `Human intro\n\n${managedBody}\n\nHuman footer` }) },
					},
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Skipped unchanged PR descriptions");
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.liveOutput).toContainEqual(
			transient("skipping PR #123 description; generated fingerprint is unchanged"),
		);
		expect(formattedExecCalls(run.context)).not.toContain("gh pr view 123 --json commits");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gh pr edit 123"))).toBe(
			false,
		);
	});

	test("pre-submit metadata preparation reports progress across large stacks", async () => {
		const run = runWithFakes({
			request: { regenerateDescriptions: true },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/top",
						ancestors: ["main", "feature/base"],
						descendants: ["feature/upstack"],
					}),
				},
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/base --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match: "gh pr list --head feature/top --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "git log --format=%B%x00 feature/base..feature/top",
						result: { stdout: "Add top branch\0" },
					},
					{
						match: "git diff feature/base..feature/top",
						result: { stdout: "diff --git a/src/top.ts b/src/top.ts\n" },
					},
					{ match: "git status --porcelain", result: { stdout: "" } },
					{ match: "gt modify --no-interactive -m Generated PR -m Generated body", result: {} },
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match:
							"gt submit --no-edit --publish --stack --update-only --no-ai --no-interactive --no-view --no-web",
						result: { stdout: "Updated existing upstack PRs\n" },
					},
					{
						match: "gh pr view --json number,url",
						result: { stdout: prIdentityJson(123, PR_URL) },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: {
							stdout: prJson({
								title: "Generated PR",
								body: "Generated body",
								headRefName: "feature/top",
							}),
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Submitted 1 PR:");
		expect(output).toContain("initial metadata prepared");
		expect(output).toContain("new title: Generated PR");
		expect(output).toContain("new description: Generated body");
		expect(output).not.toContain("Prepared initial PR metadata:");
		expect(run.liveOutput).toEqual(
			expect.arrayContaining([
				transient("inspecting Graphite submit scope before metadata preparation"),
				transient("inspecting Graphite submit branch metadata for 2 branches"),
				transient("inspecting PR metadata for feature/base (1/2)"),
				transient("inspecting PR metadata for feature/top (2/2)"),
				transient("reading local commits and diff for feature/top"),
				transient("found 2 submit branches; 1 new single-commit branch needs initial PR metadata"),
				transient("generating initial PR metadata for feature/top (1/1)"),
				transient("checking clean worktree before metadata amendment"),
				transient("amending local PR metadata commit for feature/top (1/1)"),
				transient("prepared pre-submit PR metadata for 1 branch"),
				{ stream: "stdout", text: "Updated existing upstack PRs\n" },
			]),
		);
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --stack --update-only --no-ai --no-interactive --no-view --no-web",
		);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gh pr list --head feature/upstack --state open --limit 2 --json number,url",
		);
		expect(run.stackGateway.operations()).toEqual([{ type: "stack", cwd: "/work" }]);
		expect(formattedExecCalls(run.context)).not.toContain(
			"git log --format=%B%x00 feature/top..feature/upstack",
		);
		expect(formattedExecCalls(run.context)).not.toContain("git diff feature/top..feature/upstack");
		const calls = formattedExecCalls(run.context);
		const dryRun =
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run";
		const amendment = "gt modify --no-interactive -m Generated PR -m Generated body";
		const submit =
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web";
		expect(calls.filter((call) => call === dryRun)).toHaveLength(2);
		expect(calls.indexOf(dryRun)).toBeLessThan(calls.indexOf(amendment));
		expect(calls.lastIndexOf(dryRun)).toBeGreaterThan(calls.indexOf(amendment));
		expect(calls.lastIndexOf(dryRun)).toBeLessThan(calls.indexOf(submit));
	});

	test("final readiness failure after metadata amendment stops before publication", async () => {
		const dryRun =
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run";
		const run = runWithFakes({
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({ trunk: "main", current: "feature/top", ancestors: ["main"] }),
				},
			},
			state: {
				textGeneration: [
					{ ok: true, text: defaultPrDescriptionText() },
					{ ok: false, error: "failure interpretation unavailable" },
				],
				exec: [
					...cleanCheckpointResponses(),
					{ match: dryRun, result: { stdout: "initially ready\n" }, times: 1 },
					{
						match: "gh pr list --head feature/top --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "git log --format=%B%x00 main..feature/top",
						result: { stdout: "Add top branch\0" },
					},
					{
						match: "git diff main..feature/top",
						result: { stdout: "diff --git a/src/top.ts b/src/top.ts\n" },
					},
					{ match: "git status --porcelain", result: { stdout: "" } },
					{ match: "gt modify --no-interactive -m Generated PR -m Generated body", result: {} },
					{
						match: dryRun,
						result: { code: 1, stderr: "metadata rewrite requires manual repair\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Local PR metadata commit messages were prepared before submit");
		const calls = formattedExecCalls(run.context);
		expect(calls.filter((call) => call === dryRun)).toHaveLength(2);
		expect(calls).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(calls).not.toContain(
			"gt submit --no-edit --publish --stack --update-only --no-ai --no-interactive --no-view --no-web",
		);
		expect(calls).not.toContain("gh pr view --json number,url");
	});

	test("pre-submit metadata amend failure reports concise cause and raw diagnostics", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/top",
						ancestors: ["main", "feature/base", "feature/mid"],
					}),
				},
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/base --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "gh pr list --head feature/mid --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "gh pr list --head feature/top --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "git log --format=%B%x00 main..feature/base",
						result: { stdout: "Add base\0" },
					},
					{
						match: "git diff main..feature/base",
						result: { stdout: "diff --git a/src/base.ts b/src/base.ts\n" },
					},
					{
						match: "git log --format=%B%x00 feature/base..feature/mid",
						result: { stdout: "Add mid\0" },
					},
					{
						match: "git diff feature/base..feature/mid",
						result: { stdout: "diff --git a/src/mid.ts b/src/mid.ts\n" },
					},
					{
						match: "git log --format=%B%x00 feature/mid..feature/top",
						result: { stdout: "Add top\0" },
					},
					{
						match: "git diff feature/mid..feature/top",
						result: { stdout: "diff --git a/src/top.ts b/src/top.ts\n" },
					},
					{ match: "git status --porcelain", result: { stdout: "" } },
					{
						match:
							"gt modify --no-interactive --into feature/base -m Generated PR -m Generated body",
						result: {},
					},
					{
						match:
							"gt modify --no-interactive --into feature/mid -m Generated PR -m Generated body",
						result: {
							code: 1,
							stderr: "Graphite cannot modify branch: descendants need restack\n",
						},
					},
				],
				textGeneration: [
					{ ok: true, text: defaultPrDescriptionText() },
					{ ok: true, text: defaultPrDescriptionText() },
					{ ok: true, text: defaultPrDescriptionText() },
					{ ok: false, error: "submit failure interpretation unavailable" },
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Could not amend local PR metadata for feature/mid");
		expect(error).toContain("Submission was not attempted");
		expect(error).toContain(
			"Cause: gt exited 1: Graphite cannot modify branch: descendants need restack",
		);
		expect(error).toContain("Local PR metadata commit messages were amended before the failure:");
		expect(error).toContain("- feature/base");
		expect(error).toContain("Raw log:");
		expect(
			formattedExecCalls(run.context).some(
				(call) =>
					call.startsWith("gt submit --no-edit --publish --no-stack") &&
					!call.endsWith("--dry-run"),
			),
		).toBe(false);

		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		const rawLog = await readFile(rawPath ?? "", "utf8");
		expect(rawLog).toContain("phase: pre-submit metadata");
		expect(rawLog).toContain("code: submit_metadata_amend_failed");
		expect(rawLog).toContain("message: Could not amend local PR metadata commit for feature/mid.");
		expect(rawLog).toContain("command: gt");
		expect(rawLog).toContain(
			"args: modify --no-interactive --into feature/mid -m Generated PR -m Generated body",
		);
		expect(rawLog).toContain("exit_code: 1");
		expect(rawLog).toContain("stderr: Graphite cannot modify branch: descendants need restack");
		expect(rawLog).toContain("Local PR metadata commit messages were amended before the failure:");
		expect(rawLog).toContain("- feature/base");
	});

	test("accepts submit-output PR links when current PR verification lags", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							stdout: `implicit-session-resolution-feedback-read-helpers: ${LAGGING_VERIFICATION_PR_URL} (created)\n`,
						},
					},
					{
						match: "gh pr view --json number,url",
						result: {
							code: 1,
							stderr: 'no pull requests found for branch "feature/demo"\n',
						},
					},
					{
						match: "gh pr view 1517 --json number,url,title,body,headRefName,baseRefName",
						result: {
							stdout: JSON.stringify({
								number: 1517,
								url: LAGGING_VERIFICATION_PR_URL,
								title: "Existing PR title",
								body: "Hand edited body",
								headRefName: "feature/demo",
								baseRefName: "main",
							}),
						},
					},
					{ match: "gh pr view 1517 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{
						match: "gh pr diff 1517",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{
						match: "gh pr diff 1517",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: /^gh pr edit 1517 --title Generated PR --body-file /, result: {} },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Submitted 1 PR:");
		expect(run.stdout.join("")).toContain(`#1517 ${LAGGING_VERIFICATION_PR_URL}`);
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toContain("gh pr view --json number,url");
	});

	test("deduplicates the submitted PR when Graphite and GitHub URL forms differ", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${GRAPHITE_PR_URL}\n` },
					},
					{
						match: "gh pr view --json number,url",
						result: { stdout: prIdentityJson(123, PR_URL) },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: "Hand edited body" }) },
					},
					{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output.match(/^✓ #123 /gm)).toHaveLength(1);
		expect(output).toContain(`✓ #123 ${GRAPHITE_PR_URL}`);
		expect(output).not.toContain(PR_URL);
	});

	test("post-submit no-current-PR failure gives checkpoint guidance", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: "Submitted stack without PR URL\n" },
					},
					{
						match: "gh pr view --json number,url",
						result: {
							code: 1,
							stderr: 'no pull requests found for branch "feature/demo"\n',
						},
					},
				],
				textGeneration: [{ ok: false, error: "summary unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("gt submit exited 0, but the current branch still has no PR.");
		expect(error).toContain("Submitted stack without PR URL");
		expect(error).toContain(
			"`ns flow submit` checkpoints outstanding worktree changes before submitting.",
		);
		expect(error).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});

	test("dirty worktree checkpoints before submitting", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...dirtyCheckpointResponses(),
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				textGeneration: [{ ok: true, text: "[cp] Submit checkpoint\n\n- Capture dirty work" }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("abc123 [cp] Submit checkpoint");
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("✓ Inspect");
		expect(settled).toContain("worktree inspected");
		expect(settled).toContain("✓ Generate");
		expect(settled).toContain("checkpoint message ready");
		expect(settled).toContain("✓ Commit");
		expect(settled).toContain("checkpoint committed");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"git add -A",
				expect.stringMatching(/^git commit -F /),
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			]),
		);
	});

	test("configured trunk checkpoint refusal aborts submit without model interpretation", async () => {
		const run = runWithFakes({
			request: { checks: false },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "release\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
					{ match: "gt trunk --no-interactive", result: { stdout: "release\n" } },
				],
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"Refusing to create checkpoint commit on trunk branch: release",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
	});

	test("unresolved configured trunk aborts submit deterministically before model or mutation", async () => {
		const run = runWithFakes({
			request: { checks: false },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: "" } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
					{
						match: "gt trunk --no-interactive",
						result: { code: 1, stderr: "Graphite configuration unavailable\n" },
					},
				],
				textGeneration: [],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"Could not resolve configured Graphite trunk; checkpoint was not created.",
		);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
		expect(formattedExecCalls(run.context)).not.toContain("git add -A");
	});

	test("checkpoint failure aborts before Graphite submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
					{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
				],
				textGeneration: [
					{ ok: false, error: "model unavailable" },
					{ ok: false, error: "submit failure interpretation unavailable" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		const error = run.stderr.join("");
		expect(error).toContain("Checkpoint before submit failed. Submission was not attempted.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain(
			"ns flow submit failed, and the failure could not be interpreted automatically.",
		);
		expect(error).not.toContain("submit failure interpretation unavailable");
		const settled = lastStderrOutput(run.liveOutput);
		expect(settled).toContain("✗ Checkpoint");
		expect(settled).toContain("checkpoint failed");
		expect(formattedExecCalls(run.context).some((call) => call.startsWith("gt submit"))).toBe(
			false,
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"Checkpoint before submit failed. Submission was not attempted.",
		);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("model unavailable");
	});

	test("restack-required dry-run runs restack by default", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "branch must be restacked before submitting\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: () => {
					throw new Error("confirm should not be called for default restack");
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(formattedExecCalls(run.context)).toContain("gt restack --downstack --no-interactive");
	});

	test("trunk-out-of-date dry-run failure is deterministic and skips model summarization", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout: "Running submit in 'dry-run' mode...\n",
							stderr:
								"ERROR: Aborting submit because trunk branch is out of date and could not be updated.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Graphite could not update your local trunk before submitting. Nothing was submitted.",
		);
		expect(error).toContain("Graphite reported:");
		expect(error).toContain(
			"ERROR: Aborting submit because trunk branch is out of date and could not be updated.",
		);
		expect(error).toContain("Fix: run `gt sync` to update trunk");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("Running submit in 'dry-run' mode");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("remotely updated branch dry-run failure explains what changed outside Graphite", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode. No branches will be pushed and no PRs will be opened or updated.\n\n🥞 Validating that this Graphite stack is ready to submit...\n",
							stderr:
								"ERROR: Branch add-preflight-detect-and-skip-empty-branches has been updated remotely outside of Graphite. Use gt get or gt sync to sync with remote before submitting (or use the --force flag to override this check).\n",
						},
					},
					{
						match: "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
						result: { stdout: "origin/add-preflight-detect-and-skip-empty-branches\n" },
					},
					{
						match:
							"git rev-list --left-right --count HEAD...origin/add-preflight-detect-and-skip-empty-branches",
						result: { stdout: "35\t1\n" },
					},
					{
						match:
							"git log --format=%h %s --max-count=3 origin/add-preflight-detect-and-skip-empty-branches --not HEAD",
						result: { stdout: "abc123 remote checkpoint\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Branch add-preflight-detect-and-skip-empty-branches is out of sync with its upstream PR branch, so Graphite blocked the submit. Nothing was submitted.",
		);
		expect(error).toContain(
			"Remote checked: origin/add-preflight-detect-and-skip-empty-branches (this is the PR branch, not trunk/master).",
		);
		expect(error).toContain(
			"Why: local HEAD is 35 commits ahead of and 1 commit behind origin/add-preflight-detect-and-skip-empty-branches.",
		);
		expect(error).toContain(
			"Possible cause: the PR branch was pushed/submitted from another checkout, or this local branch was rewritten after an earlier submit.",
		);
		expect(error).toContain(
			"Remote-only commits on origin/add-preflight-detect-and-skip-empty-branches (not in local HEAD):\n  - abc123 remote checkpoint",
		);
		expect(error).toContain("Fix:    run `gt sync` (or `gt get`), then rerun `ns flow submit`.");
		expect(error).toContain(
			"Bypass: `ns flow submit --force` skips Graphite's remote-update check.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("Problem: Branch");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"has been updated remotely outside of Graphite",
		);
	});

	test("merged PR missing from trunk dry-run failure gives deterministic guidance", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode.\n\n🥞 Validating that this Graphite stack is ready to submit...\n\n▸ handoff-capability/stack-feedback-remediation - PR #2257 (merged)\n",
							stderr:
								"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nWARNING: Stacks with this branch will not be submitted:\nWARNING: To submit these stacks, ensure the trunk branch contains the merged PRs in the stack or move the branches onto a trunk that does contain the merged PRs.\nWARNING: PR for the following branch has already been merged or closed:\nERROR: Aborting dry run.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"A merged PR in this stack is not in trunk master, so Graphite will not submit the stack. Nothing was submitted.",
		);
		expect(error).toContain(
			"Branch handoff-capability/stack-feedback-remediation (PR #2257, merged); trunk master.",
		);
		expect(error).toContain(
			"Fix: ensure master contains the merged PR's commits, or reparent handoff-capability/stack-feedback-remediation onto a trunk that already contains them, then rerun `ns flow submit`.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("failed with exit code 1. Submission was not attempted.");
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("merged PR missing from trunk final submit preflight gives deterministic guidance", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "master",
						current: "shared-import-scanner-test-helpers",
						ancestors: ["master"],
					}),
				},
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match:
							"gh pr list --head shared-import-scanner-test-helpers --state open --limit 2 --json number,url",
						result: {
							stdout: prIdentityListJson(2289, "https://github.com/dagster-io/sdl-tools/pull/2289"),
						},
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							code: 1,
							stdout:
								"Running in non-interactive mode.\n\n🥞 Validating that this Graphite stack is ready to submit...\n\n▸ shared-import-scanner-test-helpers - PR #2289 (merged)\n",
							stderr:
								"WARNING: PR for the following branch has already been merged but the merged commits are not contained in the latest trunk branch master.\nWARNING: Stacks with this branch will not be submitted:\nERROR: Aborting submit.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"A merged PR in this stack is not in trunk master, so Graphite will not submit the stack. Nothing was submitted.",
		);
		expect(error).toContain(
			"Branch shared-import-scanner-test-helpers (PR #2289, merged); trunk master.",
		);
		expect(error).toContain(
			"Fix: ensure master contains the merged PR's commits, or reparent shared-import-scanner-test-helpers onto a trunk that already contains them, then rerun `ns flow submit`.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("failed with exit code 1");
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("phase: submit preflight");
	});

	test("Graphite PR-info lookup submit failure gives deterministic manual recovery guidance", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const submitCommand =
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web";
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			graphiteStack: {
				stack: {
					type: "stack",
					stack: fakeStackInfo({
						trunk: "main",
						current: "feature/top",
						ancestors: ["main", "feature/base"],
					}),
				},
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match: `${submitCommand} --dry-run`,
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/base --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match: "gh pr list --head feature/top --state open --limit 2 --json number,url",
						result: { stdout: "[]" },
					},
					{
						match: "git log --format=%B%x00 feature/base..feature/top",
						result: { stdout: "Add top branch\0" },
					},
					{
						match: "git diff feature/base..feature/top",
						result: { stdout: "diff --git a/src/top.ts b/src/top.ts\n" },
					},
					{ match: "git status --porcelain", result: { stdout: "" } },
					{ match: "gt modify --no-interactive -m Generated PR -m Generated body", result: {} },
					{
						match: submitCommand,
						result: {
							code: 1,
							stdout:
								"Running in non-interactive mode. Inline prompts to fill PR fields will be skipped.\n\n🥞 Validating that this Graphite stack is ready to submit...\n",
							stderr: "ERROR: Failed to get pull request info. Please try again.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite failed while looking up pull request info during submit.");
		expect(error).toContain("suspected Graphite CLI edge case");
		expect(error).toContain(
			"run `gt submit` manually, then verify the current branch has a PR with `gt pr` or `gh pr view <branch>`",
		);
		expect(error).toContain(
			"Local PR metadata commit messages were prepared before submit; verify the metadata after resolving the Graphite failure.",
		);
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain(`${submitCommand} failed with exit code 1.`);
		const calls = formattedExecCalls(run.context);
		expect(calls.filter((call) => call === submitCommand)).toHaveLength(1);
		expect(calls).not.toContain("gt submit");
		expect(run.context.textGeneratorCalls.map((call) => call.modelSelection)).not.toContain(
			"openai-codex/submit-summary",
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		const rawLog = await readFile(rawPath ?? "", "utf8");
		expect(rawLog).toContain("phase: submit preflight");
		expect(rawLog).toContain(submitCommand);
		expect(rawLog).toContain("exit code: 1");
		expect(rawLog).toContain(
			"Running in non-interactive mode. Inline prompts to fill PR fields will be skipped.",
		);
		expect(rawLog).toContain("ERROR: Failed to get pull request info. Please try again.");
	});

	test("unknown dry-run failure uses model-primary message and writes a raw log", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: {
				NS_SUBMIT_FAILURE_LOG_DIR: logRoot,
			},
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout: "full stdout details\nsecond line\n",
							stderr: "mystery graphite failure\n",
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Graphite failed during dry-run.\nNext step: Inspect the raw log and rerun the dry-run command.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Graphite failed during dry-run.");
		expect(error).toContain("Next step: Inspect the raw log");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("## Submit failed");
		expect(error).not.toContain("## What happened");
		expect(error).not.toContain("```");
		expect(error).not.toContain("----- stdout -----");
		expect(error).not.toContain("mystery graphite failure");

		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("full stdout details\nsecond line");
		expect(await readFile(rawPath ?? "", "utf8")).toContain("mystery graphite failure");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]?.modelSelection).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal",
		});
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"Truncation: transcript was not truncated.",
		);
		expect(run.context.textGeneratorCalls[0]?.prompt).not.toContain("Raw log path:");
	});

	test("spawn failure raw logs preserve termination evidence", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							type: "spawn-failed",
							stdout: "",
							stderr: "spawn gt ENOENT",
							error: "spawn gt ENOENT",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(2);
		const error = run.stderr.join("");
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		const rawLog = await readFile(rawPath ?? "", "utf8");
		expect(rawLog).toContain("termination: spawn-failed");
		expect(rawLog).toContain("exit code: unavailable");
		expect(rawLog).toContain("spawn error: spawn gt ENOENT");
		expect(rawLog).not.toContain("startup error:");
		expect(rawLog).not.toContain("killed:");
	});

	test("unknown dry-run failure falls back to original stderr when model generation fails", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stdout: "raw stdout\n", stderr: "raw stderr\n" },
					},
				],
				textGeneration: [{ ok: false, error: "model unavailable" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("raw stderr");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain(
			"ns flow submit failed, and the failure could not be interpreted automatically.",
		);
		expect(error).not.toContain("model unavailable");
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("raw stderr");
	});

	test("default restack does not prompt before submit", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack is required before submit\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					...successfulSubmitResponses().slice(cleanCheckpointResponses().length),
				],
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return true;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(confirmations).toEqual([]);
		expect(formattedExecCalls(run.context)).toContain("gt restack --downstack --no-interactive");
	});

	test("--no-restack preserves guided failure without running restack", async () => {
		const run = runWithFakes({
			request: { restack: false },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "must be restacked before submit\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"Graphite needs a restack before submitting, but automatic restack was disabled or unavailable. Nothing was submitted.",
		);
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt restack --downstack --no-interactive",
		);
	});

	test("restack conflicts are reported before submit", async () => {
		const run = runWithFakes({
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{
						match: "gt restack --downstack --no-interactive",
						result: { code: 1, stderr: "CONFLICT (content): src/app.ts\n" },
					},
					{ match: "git diff --name-only --diff-filter=U", result: { stdout: "src/app.ts\n" } },
					{ match: "git status --porcelain", result: { stdout: "UU src/app.ts\n" } },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			"`gt restack --downstack` hit merge conflicts, so nothing was submitted.",
		);
		expect(run.stderr.join("")).toContain("- src/app.ts");
		expect(run.stderr.join("")).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		expect(
			formattedExecCalls(run.context).filter(
				(call) =>
					call ===
					"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			),
		).toEqual([]);
	});

	test("readiness recheck failure is deterministic and skips model summarization", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { code: 1, stderr: "restack required before submit\n" },
					},
					{ match: "gt restack --downstack --no-interactive", result: { stdout: "restacked\n" } },
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							code: 1,
							stdout:
								"Running submit in 'dry-run' mode.\nValidating that this Graphite stack is ready to submit...\n",
							stderr:
								"WARNING: You must restack before submitting this stack.\nERROR: Aborting dry run.\n",
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain(
			"Graphite still needs a restack after `ns flow submit` already ran `gt restack --downstack --no-interactive`. Nothing was submitted.",
		);
		expect(error).toContain("Fix: run `gt restack --downstack` manually");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("WARNING: You must restack before submitting this stack.");
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"WARNING: You must restack before submitting this stack.",
		);
	});

	test("empty-branch dry-run warning stops during preflight before metadata or submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							stdout: `Running submit in 'dry-run' mode.

🥞 Validating that this Graphite stack is ready to submit...

▸ code-smell/tools-vibechk-exec-artifact-bounds
`,
							stderr: `WARNING: This branch does not introduce any changes:
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
`,
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("WARNING: This branch does not introduce any changes:");
		expect(error).toContain("▸ code-smell/tools-vibechk-exec-artifact-bounds");
		expect(error).toContain(
			"Graphite will not submit empty branches because GitHub rejects empty PRs. Nothing was submitted.",
		);
		expect(error).toContain("gt delete code-smell/tools-vibechk-exec-artifact-bounds -f -q");
		expect(error).toContain("Raw log:");
		expect(run.stackGateway.operations()).toEqual([]);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain("phase: preflight");
	});

	test("empty branch dry-run with no-op PRs stops before metadata or submit", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		tempDirs.push(logRoot);
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: {
							stdout: `Running submit in 'dry-run' mode.

🥞 Validating that this Graphite stack is ready to submit...
WARNING: This branch does not introduce any changes:
▸ empty-branch-test
WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
WARNING: In order to submit, commit some changes to it or delete it and try again.

📝 Preparing to submit PRs for the following branches...
▸ add-preflight-detect-and-skip-empty-branches (No-op)

🆗 All PRs up to date.
`,
						},
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const result = await run.result;
		expect(result.type).toBe("negative");
		if (result.type === "negative") {
			expect(
				result.message.startsWith(
					"WARNING: This branch does not introduce any changes:\n▸ empty-branch-test",
				),
			).toBe(true);
			expect(result.message).toContain(
				"Graphite will not submit empty branches because GitHub rejects empty PRs. Nothing was submitted.",
			);
			expect(result.message).toContain("gt delete empty-branch-test -f -q");
			expect(result.message.match(/^Raw log: /gmu)).toHaveLength(1);
		}
		const error = run.stderr.join("");
		expect(error).toContain("WARNING: This branch does not introduce any changes:");
		expect(error).toContain("▸ empty-branch-test");
		expect(error).toContain(
			"Graphite will not submit empty branches because GitHub rejects empty PRs. Nothing was submitted.",
		);
		expect(error).toContain("gt delete empty-branch-test -f -q");
		expect(error).toContain("Raw log:");
		expect(run.stackGateway.operations()).toEqual([]);
		expect(formattedExecCalls(run.context)).not.toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
		expect(run.context.textGeneratorCalls).toHaveLength(0);
	});

	test("empty-branch post-submit failure uses model-primary output and raw log path", async () => {
		const logRoot = await mkdtemp(join(tmpdir(), "ns-submit-test-"));
		const run = runWithFakes({
			env: { NS_SUBMIT_FAILURE_LOG_DIR: logRoot },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: {
							stdout: `Running in non-interactive mode. Inline prompts to fill PR fields will be skipped.

	🥞 Validating that this Graphite stack is ready to submit...
	▸ ns-extension-api-followup-stack

	📝 Preparing to submit PRs for the following branches...
	▸ add-ns-extension-api (No-op)
	`,
							stderr: `WARNING: This branch does not introduce any changes:
	WARNING: This branch and any dependent branches will not be submitted, as GitHub does not allow empty PRs.
	`,
						},
					},
					{
						match: "gh pr view --json number,url",
						result: {
							code: 1,
							stderr: 'no pull requests found for branch "feature/demo"\n',
						},
					},
				],
				textGeneration: [
					{
						ok: true,
						text: "Submit stack contains an empty branch; Graphite will not submit it.\nBranch: ns-extension-api-followup-stack\nWhat succeeded: Non-empty branches may already have been submitted or updated.\nRecommended remediation: delete the empty branch if it has no remaining work.\nAlternative: Add and commit real changes only if this branch should still have its own PR.",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("Submit stack contains an empty branch; Graphite will not submit it.");
		expect(error).toContain("Branch: ns-extension-api-followup-stack");
		expect(error).toContain("Non-empty branches may already have been submitted or updated.");
		expect(error).toContain("Raw log:");
		expect(error).not.toContain("##");
		expect(error).not.toContain("**");
		expect(error).not.toContain("```");
		expect(error).not.toContain("----- AI interpretation (model-generated) -----");
		expect(error).not.toContain("----- stdout -----");
		expect(
			error.indexOf("Recommended remediation: delete the empty branch"),
		).toBeGreaterThanOrEqual(0);
		expect(error.indexOf("Alternative: Add and commit real changes")).toBeGreaterThan(
			error.indexOf("Recommended remediation: delete the empty branch"),
		);
		expect(error.match(/^Raw log: /gmu)).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain(
			"because branch ns-extension-api-followup-stack is empty",
		);
		const rawPath = error.match(/Raw log: (?<path>\S+)/u)?.groups?.path;
		expect(rawPath?.startsWith(logRoot)).toBe(true);
		expect(await readFile(rawPath ?? "", "utf8")).toContain(
			"because branch ns-extension-api-followup-stack is empty",
		);
	});

	test("description edit failure keeps submitted PR links visible", async () => {
		const run = runWithFakes({
			request: { regenerateDescriptions: true },
			state: {
				exec: [
					...cleanCheckpointResponses(),
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
						result: { stdout: "ready\n" },
					},
					{
						match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
						result: { stdout: prIdentityListJson(123, PR_URL) },
					},
					{
						match:
							"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
						result: { stdout: `Submitted ${PR_URL}\n` },
					},
					{
						match: "gh pr view --json number,url",
						result: { stdout: prIdentityJson(123, PR_URL) },
					},
					{
						match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
						result: { stdout: prJson({ body: "" }) },
					},
					{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: "git patch-id --stable",
						result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
					},
					{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
					{
						match: /^gh pr edit 123 --title Generated PR --body-file /,
						result: { code: 1, stderr: "edit denied\n" },
					},
				],
				textGeneration: [{ ok: true, text: "Generated PR\n\nGenerated body" }],
			},
		});

		expect(await run.exit).toBe(1);
		const error = run.stderr.join("");
		expect(error).toContain("PRs were submitted; description generation failed.");
		expect(error).toContain(`#123 ${PR_URL}`);
		expect(error).toContain("Could not update PR #123.");
		expect(error).toContain("Raw log:");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});
});

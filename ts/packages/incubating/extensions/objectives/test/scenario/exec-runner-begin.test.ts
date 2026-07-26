import { describe, expect, test } from "vitest";

import { envelopeJsonText, toMachineEnvelope, type ClinkrExit } from "@nseng-ai/clinkr";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/testing";
import { optionalEntries } from "@nseng-ai/foundation/primitives";

import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";
import type {
	RunnerFilePresenceResult,
	RunnerTextFileReadResult,
} from "../../src/runner/context.ts";
import { command } from "../../src/ns/objective/exec/runner-begin/command.ts";
import { SequencedGitGateway, type SequencedGitGatewayState } from "../unit/runner/context.ts";
import { FakeObjectiveNsApi, runObjectiveCommand } from "../support/ns-command-harness.ts";

const SLUG = "demo-objective";
const REPORT_PATH = "/scratch/step-1-report.json";

function openObjectiveStorage(): ObjectiveStorage {
	return new ObjectiveStorage(new FakeObjectiveStorageGateway({ records: [{ slug: SLUG }] }));
}

/** Clean tree on main; begin never advances past the first git states. */
function cleanGitState(overrides: SequencedGitGatewayState = {}): SequencedGitGatewayState {
	return {
		optionalRepoRoot: "/repo",
		trunkBranch: "main",
		currentBranch: "main",
		statusPaths: { changedPaths: [] },
		headCommit: "head1234",
		...overrides,
	};
}

/** Report file does not exist; guidance files resolve when provided. */
function missingReportFileReader(
	files: Record<string, string> = {},
): (path: string) => Promise<RunnerTextFileReadResult> {
	return async (path) => {
		const content = files[path];
		if (content === undefined) return { type: "error", message: `ENOENT: no such file ${path}` };
		return { type: "ok", content };
	};
}

interface ScenarioOptions {
	git?: SequencedGitGatewayState;
	readTextFile?: (path: string) => Promise<RunnerTextFileReadResult>;
	filePresence?: (path: string) => Promise<RunnerFilePresenceResult>;
	outputFormat?: "human" | "json" | "markdown";
}

function makeApi(options: ScenarioOptions = {}): FakeObjectiveNsApi {
	return new FakeObjectiveNsApi({
		git: new SequencedGitGateway(options.git ?? cleanGitState()),
		graphite: new InMemoryGraphiteBranchGateway({}),
		storage: openObjectiveStorage(),
		readTextFile: options.readTextFile ?? missingReportFileReader(),
		filePresence: options.filePresence ?? (async () => ({ type: "missing" })),
		...optionalEntries({ outputFormat: options.outputFormat }),
	});
}

function assertJsonEnvelopeStdout<T, N, F, U>(
	api: FakeObjectiveNsApi,
	exit: ClinkrExit<T, N, F, U>,
): unknown {
	const stdout = `${api.stdoutChunks.join("")}${envelopeJsonText(toMachineEnvelope(exit))}`;
	expect(stdout).not.toMatch(/^# Runner Begin:/u);
	return JSON.parse(stdout) as unknown;
}

describe("ns objective exec runner-begin scenarios", () => {
	test("happy default: emits facts and a json-file prompt, dispatches nothing", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data!!).toMatchObject({
			slug: SLUG,
			mode: "default",
			baseBranch: "main",
			headAtDispatch: "head1234",
			changedPaths: [],
			reportPath: REPORT_PATH,
		});
		expect(exit.data!!.objectivePath).toContain(SLUG);
		expect(exit.data!!.prompt).toContain(`\`${REPORT_PATH}\``);
		expect(exit.data!!.prompt).toContain('"status": "<ready-for-parent-commit | stop | blocked>"');
		expect(exit.data!!.prompt).toContain("Leave ALL changes uncommitted.");
		expect(api.phases).toEqual(["checking-preconditions"]);
		expect(api.stdoutChunks).toEqual([]);
	});

	test("json mode emits exactly one machine envelope", async () => {
		const api = makeApi({ outputFormat: "json" });

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api },
		);

		const envelope = assertJsonEnvelopeStdout(api, exit) as { status: string; data: unknown };
		expect(envelope.status).toBe("ok");
	});

	test("relative report path resolves against cwd into facts and prompt", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: "../scratch/report.json" },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data!!.reportPath).toBe("/scratch/report.json");
		expect(exit.data!!.prompt).toContain("/scratch/report.json");
	});

	test("recover mode carries live changed paths and the recover preamble", async () => {
		const api = makeApi({
			git: cleanGitState({
				currentBranch: "feature/demo-step",
				statusPaths: { changedPaths: ["src/a.ts", "src/b.ts"] },
			}),
		});

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, recover: true, reportPath: REPORT_PATH },
			{ api },
		);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data!!.mode).toBe("recover");
		expect(exit.data!!.baseBranch).toBe("feature/demo-step");
		expect(exit.data!!.changedPaths).toEqual(["src/a.ts", "src/b.ts"]);
		expect(exit.data!!.prompt).toContain("Recovery mode: a previous runner step failed");
		expect(exit.data!!.prompt).toContain("- src/a.ts");
	});

	test("guidance reaches the prompt verbatim, inline and via @file", async () => {
		const inlineApi = makeApi();
		const inlineExit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH, guidance: "Only touch the parser." },
			{ api: inlineApi },
		);
		expect(inlineExit.type).toBe("ok");
		if (inlineExit.type === "ok") {
			expect(inlineExit.data!!.prompt).toContain("Only touch the parser.");
		}

		const fileApi = makeApi({
			readTextFile: missingReportFileReader({
				"/repo/notes/guidance.md": "Guidance loaded from a file.",
			}),
		});
		const fileExit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH, guidance: "@notes/guidance.md" },
			{ api: fileApi },
		);
		expect(fileExit.type).toBe("ok");
		if (fileExit.type === "ok") {
			expect(fileExit.data!!.prompt).toContain("Guidance loaded from a file.");
		}
	});

	test("missing and invalid slugs are usage errors", async () => {
		for (const request of [
			{ reportPath: REPORT_PATH },
			{ slug: "bad/slug", reportPath: REPORT_PATH },
		]) {
			const api = makeApi();
			const exit = await runObjectiveCommand(await command(), request, { api });
			expect(exit.type).toBe("usageError");
		}
	});

	test("missing --report-path is a usage error before any git access", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(await command(), { slug: SLUG }, { api });

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") throw new Error("expected usageError exit");
		expect(exit.message).toContain("--report-path");
	});

	test("a report path inside the repository worktree is refused", async () => {
		for (const reportPath of ["/repo/report.json", "report.json", "/repo", "sub/dir/report.json"]) {
			const api = makeApi();
			const exit = await runObjectiveCommand(await command(), { slug: SLUG, reportPath }, { api });
			expect(exit.type).toBe("usageError");
			if (exit.type !== "usageError") throw new Error("expected usageError exit");
			expect(exit.message).toContain("inside the repository worktree");
		}
	});

	test("an already-existing report path is refused (stale-report replay guard)", async () => {
		const api = makeApi({
			filePresence: async () => ({ type: "present" }),
		});

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api },
		);

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") throw new Error("expected usageError exit");
		expect(exit.message).toContain("already exists");
	});

	test("report-path presence errors fail closed", async () => {
		const api = makeApi({
			filePresence: async () => ({ type: "error", message: "EACCES: permission denied" }),
		});

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api },
		);

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") throw new Error("expected failure exit");
		expect(exit.errorType).toBe("report-path-presence-failed");
		expect(exit.message).toContain("EACCES");
		expect(api.phases).toEqual([]);
	});

	test("unreadable @file guidance is a usage error", async () => {
		const api = makeApi();

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH, guidance: "@missing/notes.md" },
			{ api },
		);

		expect(exit.type).toBe("usageError");
		if (exit.type !== "usageError") throw new Error("expected usageError exit");
		expect(exit.message).toContain("/repo/missing/notes.md");
	});

	test("dirty tree in default mode is a negative refusal", async () => {
		const api = makeApi({
			git: cleanGitState({ statusPaths: { changedPaths: ["src/a.ts"] } }),
		});

		const exit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api },
		);

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("Worktree is dirty");
	});

	test("clean tree and trunk branch are negative refusals in recover mode", async () => {
		const cleanApi = makeApi({ git: cleanGitState({ currentBranch: "feature/x" }) });
		const cleanExit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, recover: true, reportPath: REPORT_PATH },
			{ api: cleanApi },
		);
		expect(cleanExit.type).toBe("negative");

		const trunkApi = makeApi({
			git: cleanGitState({ statusPaths: { changedPaths: ["src/a.ts"] } }),
		});
		const trunkExit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, recover: true, reportPath: REPORT_PATH },
			{ api: trunkApi },
		);
		expect(trunkExit.type).toBe("negative");
		if (trunkExit.type !== "negative") throw new Error("expected negative exit");
		expect(trunkExit.message).toContain("trunk");
	});

	test("closed objective and unknown slug map to refusal and usage error", async () => {
		const closedApi = new FakeObjectiveNsApi({
			git: new SequencedGitGateway(cleanGitState()),
			graphite: new InMemoryGraphiteBranchGateway({}),
			storage: new ObjectiveStorage(
				new FakeObjectiveStorageGateway({ records: [{ slug: SLUG, isClosed: true }] }),
			),
			readTextFile: missingReportFileReader(),
		});
		const closedExit = await runObjectiveCommand(
			await command(),
			{ slug: SLUG, reportPath: REPORT_PATH },
			{ api: closedApi },
		);
		expect(closedExit.type).toBe("negative");

		const unknownApi = makeApi();
		const unknownExit = await runObjectiveCommand(
			await command(),
			{ slug: "never-heard-of-it", reportPath: REPORT_PATH },
			{ api: unknownApi },
		);
		expect(unknownExit.type).toBe("usageError");
	});
});

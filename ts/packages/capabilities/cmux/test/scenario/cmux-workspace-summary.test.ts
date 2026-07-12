import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";

import { cmuxWorkspaceSummaryNsCommand } from "../../src/ns/commands/workspace-summary.ts";

interface RecordedExecCall {
	command: string;
	args: string[];
	options: NsExecOptions | undefined;
}

interface FakeCmuxNsApiOptions {
	env?: Record<string, string | undefined>;
	/** Space-joined cmux argv that should fail with exit 2. */
	failedCommand?: string;
}

class FakeCmuxNsApi implements NsExtensionApi {
	readonly cwd = "/repo";
	readonly env: Record<string, string | undefined>;
	readonly execCalls: RecordedExecCall[] = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	private readonly failedCommand: string | undefined;

	constructor(options: FakeCmuxNsApiOptions = {}) {
		this.env = { PATH: "/bin", ...(options.env ?? {}) };
		this.failedCommand = options.failedCommand;
	}

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		if (args.join(" ") === this.failedCommand) {
			return { type: "exited", stdout: "", stderr: "workspace not found", code: 2, signal: null };
		}
		return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			throw new Error(`Unexpected text-generation call: ${JSON.stringify(request)}`);
		},
	};
}

function runWorkspaceSummary(api: FakeCmuxNsApi, argv: readonly string[]) {
	return cmuxWorkspaceSummaryNsCommand.run(api, { argv: [...argv] });
}

describe("ns cmux exec workspace-summary", () => {
	test("selected help documents the request surface", async () => {
		const api = new FakeCmuxNsApi();
		const exit = await runWorkspaceSummary(api, ["-h"]);

		expect(exit).toMatchObject({ type: "ok" });
		if (exit.type !== "ok") return;
		const help = String(exit.data);
		expect(help).toContain("workspace-summary");
		expect(help).toContain("--title");
		expect(help).toContain("--description");
		expect(help).toContain("--workspace");
		expect(api.execCalls).toEqual([]);
	});

	test("publishes its machine schema", async () => {
		const api = new FakeCmuxNsApi();
		const exit = await runWorkspaceSummary(api, ["--json-schema"]);

		expect(exit).toMatchObject({ type: "ok" });
		if (exit.type !== "ok") return;
		expect(exit.data).toHaveProperty("inputJsonSchema");
		expect(exit.data).toHaveProperty("outputJsonSchema");
		expect(api.execCalls).toEqual([]);
	});

	test("applies title, description, and status through the cmux CLI", async () => {
		const api = new FakeCmuxNsApi({
			env: { CMUX_WORKSPACE_ID: "workspace:16", CMUX_TAB_ID: "workspace:tab" },
		});

		const exit = await runWorkspaceSummary(api, [
			"--title",
			"Ship cmux summary command",
			"--description",
			"Goal: Add a project-local Pi command that labels this cmux workspace.",
		]);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				success: true,
				workspace: "workspace:16",
				title: "Ship cmux summary command",
				description: "Goal: Add a project-local Pi command that labels this cmux workspace.",
				statusKey: "pi-summary",
				error: null,
			},
		});
		expect(api.execCalls.map((call) => [call.command, call.args])).toEqual([
			["cmux", ["workspace", "rename", "workspace:16", "--title", "Ship cmux summary command"]],
			[
				"cmux",
				[
					"workspace-action",
					"--workspace",
					"workspace:16",
					"--action",
					"set-description",
					"--description",
					"Goal: Add a project-local Pi command that labels this cmux workspace.",
				],
			],
			["cmux", ["clear-status", "pi-summary", "--workspace", "workspace:16"]],
		]);
	});

	test("reports missing description and missing workspace as usage errors", async () => {
		const missingDescriptionApi = new FakeCmuxNsApi({
			env: { CMUX_WORKSPACE_ID: "workspace:16" },
		});
		const missingDescription = await runWorkspaceSummary(missingDescriptionApi, [
			"--title",
			"Missing description",
		]);
		expect(missingDescription).toMatchObject({
			type: "usageError",
			message: "Provide --description.",
			data: { success: false, error: { code: "missing-description" } },
		});
		expect(missingDescriptionApi.execCalls).toEqual([]);

		const missingWorkspaceApi = new FakeCmuxNsApi();
		const missingWorkspace = await runWorkspaceSummary(missingWorkspaceApi, [
			"--title",
			"No workspace",
			"--description",
			"Goal: Test missing workspace.",
		]);
		expect(missingWorkspace).toMatchObject({
			type: "usageError",
			data: { success: false, workspace: null, error: { code: "missing-workspace" } },
		});
		expect(missingWorkspaceApi.execCalls).toEqual([]);
	});

	test("reports cmux command failures with the failing argv", async () => {
		const api = new FakeCmuxNsApi({
			failedCommand: "workspace rename workspace:16 --title fail",
		});

		const exit = await runWorkspaceSummary(api, [
			"--workspace",
			"workspace:16",
			"--title",
			"fail",
			"--description",
			"Goal: Test failure.",
		]);

		expect(exit).toMatchObject({
			type: "failure",
			errorType: "rename-workspace-failed",
			data: {
				success: false,
				error: {
					code: "rename-workspace-failed",
					commandFailure: {
						command: ["cmux", "workspace", "rename", "workspace:16", "--title", "fail"],
						exitCode: 2,
						stderr: "workspace not found",
					},
				},
			},
		});
	});
});

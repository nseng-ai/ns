import process from "node:process";

import { flowExtensionDescriptor } from "@nseng-ai/flow/ns-extension";
import {
	noopNsCommandIo,
	noopNsProgress,
	defineCommand,
	failure,
	negative,
	ok,
	usageError,
	z,
	type ExecResult,
	type NsExecOptions,
} from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext, type PreinstalledNsCommandSource } from "@nseng-ai/sdk/cli";
import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandOutputDetails,
	type CliCommandRunDeps,
	type CommandContext,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import registerFlowExtension from "../../src/extension.ts";
import { describe, expect, test, vi } from "vitest";

const qualificationRequestSchema = z.object({
	value: z.string().default("argv"),
	outcome: z.enum(["success", "negative", "failure", "usage-error"]).default("success"),
});
const qualificationResultSchema = z.object({ value: z.string() });

const qualificationCommand = defineCommand({
	schema: qualificationRequestSchema,
	resultSchema: qualificationResultSchema,
	renderHuman: (result) => `final:${result.value}`,
	handler: (ctx, request) => {
		ctx.resultOutput.write("exact:");
		ctx.resultOutput.write(`${request.value}\n`);
		ctx.commandIo.notify(`auxiliary:${request.value}`, "warning");
		switch (request.outcome) {
			case "success":
				return ok({ value: request.value });
			case "negative":
				return negative("semantic refusal", { data: { value: request.value } });
			case "failure":
				return failure("qualified-failure", "qualified failure", { value: request.value });
			case "usage-error":
				return usageError("qualified usage error", { value: request.value });
		}
	},
});

const interactionCommand = defineCommand({
	schema: z.object({}),
	resultSchema: z.object({ confirmation: z.string(), selection: z.string() }),
	renderHuman: (result) => `${result.confirmation}:${result.selection}`,
	handler: async (ctx) => {
		const confirmation = await ctx.confirm("Confirm qualification", "Continue?", {
			defaultAnswer: "no",
		});
		const selection = await ctx.select("Choose qualification", ["one", "two"]);
		return ok({
			confirmation: confirmation.type,
			selection: selection.type === "selected" ? selection.value : selection.type,
		});
	},
});

const qualificationSource: PreinstalledNsCommandSource = {
	label: "qualification",
	kind: "preinstalled",
	origin: "host",
	helpClassification: "extension",
	compose: (root) => {
		root.group(
			"qualification",
			{ description: "Qualify embedded invocation behavior." },
			(group) => {
				group.command(
					"run",
					{ description: "Qualify presentation and outcomes." },
					() => qualificationCommand,
				);
				group.command(
					"interact",
					{ description: "Qualify semantic interaction." },
					() => interactionCommand,
				);
			},
		);
	},
};

const flowSource: PreinstalledNsCommandSource = {
	label: "flow",
	kind: "preinstalled",
	origin: "package",
	helpClassification: "extension",
	commandDirectory: flowExtensionDescriptor.commandDirectory,
};

type RegisteredCommand = Parameters<CliCommandExtensionAPI["registerCommand"]>[1];
type SentMessage = Parameters<NonNullable<CliCommandExtensionAPI["sendMessage"]>>[0];

class FakePi implements CliCommandExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: SentMessage[] = [];

	async exec(): Promise<{ stdout: string; stderr: string; code: number }> {
		return { stdout: "", stderr: "", code: 0 };
	}

	sendUserMessage(): void {}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(): void {}

	readonly sendMessage = (message: SentMessage): void => {
		if (message.customType !== "ns-command-ack") this.messages.push(message);
	};
}

class QualificationContext implements NsCliBaseContext {
	readonly cwd = "/repo";
	readonly env: Record<string, string | undefined> = {};
	readonly textGenerator = {
		generateText: async () => ({ ok: false as const, error: "unexpected text generation" }),
	};
	readonly commandIo = noopNsCommandIo;
	readonly resultOutput = { write: () => {} };
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: true };
	readonly outputFormat = "human" as const;
	readonly isInteractive = () => false;
	readonly confirm = async () => ({ type: "declined" as const });
	readonly select = async () => ({ type: "cancelled" as const });

	async exec(command: string, args: string[], _options?: NsExecOptions): Promise<ExecResult> {
		const display = [command, ...args].join(" ");
		const stdout =
			display === "git rev-parse --show-toplevel"
				? "/repo\n"
				: display === "git symbolic-ref --short HEAD"
					? "feature/qualification\n"
					: display === "git status --porcelain=v1" || display === "git diff HEAD --no-ext-diff"
						? ""
						: undefined;
		if (stdout === undefined) {
			return {
				type: "exited",
				code: 99,
				signal: null,
				stdout: "",
				stderr: `unexpected command: ${display}`,
			};
		}
		return { type: "exited", code: 0, signal: null, stdout, stderr: "" };
	}
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected registered command ${name}.`);
	return command;
}

function createContext(
	options: {
		confirm?: () => boolean;
		select?: () => string | undefined;
		hasUI?: boolean;
		statuses?: string[];
	} = {},
): CommandContext {
	return {
		cwd: "/repo",
		hasUI: options.hasUI ?? true,
		ui: {
			notify() {},
			...(options.confirm === undefined ? {} : { confirm: options.confirm }),
			...(options.select === undefined ? {} : { select: options.select }),
			setStatus(_key, value) {
				if (value !== undefined) options.statuses?.push(value);
			},
		},
		async waitForIdle() {},
	};
}

function detailsFor(pi: FakePi): CliCommandOutputDetails {
	const output = pi.messages.find(
		(message) => message.customType === CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	);
	if (output === undefined) throw new Error("Expected a completed command output message.");
	return output.details as CliCommandOutputDetails;
}

function registerQualification(pi: FakePi, observations: { jsonReads: number }): void {
	const context = new QualificationContext();
	const runNs = async (args: readonly string[], deps: CliCommandRunDeps): Promise<number> => {
		return await runCli(args, {
			...deps,
			context,
			preinstalledSources: () => [flowSource, qualificationSource],
			readJsonInput: async () => {
				observations.jsonReads += 1;
				return (await deps.readJsonInput?.()) ?? "";
			},
		});
	};
	registerCliCommandExtension(pi, {
		cliName: "ns",
		piNamespace: "ns:qualification",
		commands: [
			{
				name: "run",
				description: "Qualify presentation and outcomes.",
				argvPrefix: ["qualification", "run"],
			},
			{
				name: "interact",
				description: "Qualify semantic interaction.",
				argvPrefix: ["qualification", "interact"],
			},
		],
		runCli: runNs,
	});
	registerFlowExtension(pi, { runCli: runNs });
}

describe("real Clinkr SDK Flow Pi invocation composition", () => {
	test("acquires finite JSON only for --input-json and preserves exact result and echo capture", async () => {
		const pi = new FakePi();
		const observations = { jsonReads: 0 };
		registerQualification(pi, observations);
		const context = createContext();

		for (const args of ["", "--help", "--json-schema", "--input-json --help", "unexpected"]) {
			await commandFor(pi, "ns:qualification:run").handler(args, context);
		}
		expect(observations.jsonReads).toBe(0);

		await commandFor(pi, "ns:qualification:run").handler("--input-json", context);
		expect(observations.jsonReads).toBe(1);
		const inputOutput = pi.messages.at(-1);
		if (inputOutput === undefined) throw new Error("Expected JSON-input command output.");
		expect((inputOutput.details as CliCommandOutputDetails).exitCode).toBe(2);

		pi.messages.length = 0;
		await commandFor(pi, "ns:qualification:run").handler("--value durable", context);
		expect(detailsFor(pi)).toMatchObject({
			exitCode: 0,
			stdout: "exact:durable\nfinal:durable\n",
			stderr: "auxiliary:durable\n",
		});
	});

	test.each([
		["negative", 1],
		["failure", 2],
		["usage-error", 2],
	] as const)("preserves the %s structured outcome", async (outcome, exitCode) => {
		const pi = new FakePi();
		registerQualification(pi, { jsonReads: 0 });

		await commandFor(pi, "ns:qualification:run").handler(`--outcome ${outcome}`, createContext());

		expect(detailsFor(pi).exitCode).toBe(exitCode);
	});

	test("uses semantic Pi interaction and fails closed without applicable UI", async () => {
		const pi = new FakePi();
		registerQualification(pi, { jsonReads: 0 });
		await commandFor(pi, "ns:qualification:interact").handler(
			"",
			createContext({ confirm: () => false, select: () => undefined }),
		);
		expect(detailsFor(pi).stdout).toBe("declined:cancelled\n");

		pi.messages.length = 0;
		await commandFor(pi, "ns:qualification:interact").handler(
			"",
			createContext({ select: () => "one" }),
		);
		expect(detailsFor(pi)).toMatchObject({ exitCode: 1 });
		expect(detailsFor(pi).stderr).toContain("Pi confirmation UI is unavailable");
	});

	test("presents real Flow textual progress exactly once without a settled duplicate", async () => {
		const pi = new FakePi();
		registerQualification(pi, { jsonReads: 0 });
		const statuses: string[] = [];
		const stdoutWrite = vi.spyOn(process.stdout, "write");
		const stderrWrite = vi.spyOn(process.stderr, "write");

		await commandFor(pi, "ns:flow:changes").handler("", createContext({ statuses }));

		expect(detailsFor(pi)).toMatchObject({ exitCode: 0, stderr: "" });
		expect(detailsFor(pi).stdout).toContain("Working tree is clean");
		expect(detailsFor(pi).stdout).not.toContain("Inspecting worktree");
		expect(statuses.filter((status) => status.includes("Inspecting worktree"))).toHaveLength(1);
		expect(stdoutWrite).not.toHaveBeenCalled();
		expect(stderrWrite).not.toHaveBeenCalled();
	});
});

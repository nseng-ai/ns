import { z } from "zod";

import { describe, expect, test } from "vitest";

import type { SdlCliDeps } from "../../src/cli.ts";
import type {
	ExtensionCommandCandidate,
	SelectedSdlCommandLoadResult,
} from "../../src/extension-registry.ts";
import { runCliWithFakes, type RunWithFakesOptions } from "./sdl-cli-fakes.ts";
import type { SdlCommand } from "sdl-sdk";

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}

describe("sdl completion CLI", () => {
	test("prints dynamic setup scripts for supported shells", async () => {
		for (const shell of ["bash", "zsh", "fish"] as const) {
			const run = runWithFakes({
				args: ["completion", shell],
				extensionRegistry: fakeCompletionRegistry(),
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("'sdl' 'completion' 'exec' 'resolve'");
			expect(run.stderr.join("")).toBe("");
		}
	});

	test("hidden resolver returns top-level candidates as newline values only", async () => {
		const registry = fakeCompletionRegistry({ commands: [helloCommand()] });
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", ""],
			extensionRegistry: registry,
		});

		expect(await run.exit).toBe(0);
		const values = run.stdout
			.join("")
			.split("\n")
			.filter((value) => value !== "");
		expect(values).toContain("completion");
		expect(values).toContain("hello");
		expect(run.stdout.join("")).not.toContain("Hello");
		expect(run.stderr.join("")).toBe("");
		expect(registry.loadLog).toEqual([]);
	});

	test("selected command option completion loads only the selected command", async () => {
		const registry = fakeCompletionRegistry({
			commands: [helloCommand({ schema: z.object({ loud: z.boolean().default(false) }) })],
		});
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			extensionRegistry: registry,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("--loud\n");
		expect(run.stderr.join("")).toBe("");
		expect(registry.loadLog).toEqual(["hello"]);
	});

	test("selected broken command reports on stderr without candidate stdout", async () => {
		const registry = fakeCompletionRegistry({
			commands: [helloCommand()],
			loadFailures: { hello: "selected boom" },
		});
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			extensionRegistry: registry,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("selected boom");
		expect(registry.loadLog).toEqual(["hello"]);
	});

	test("selected command dynamic provider returns candidates and keeps static options", async () => {
		const registry = fakeCompletionRegistry({
			commands: [
				helloCommand({
					schema: z.object({
						name: z.string().optional(),
						loud: z.boolean().default(false),
					}),
					positionals: { name: { position: 0 } },
					completionProvider(_ctx, request) {
						return ["alpha", "beta"]
							.filter((value) => value.startsWith(request.current))
							.map((value) => ({ value, type: "positional-value" }));
					},
				}),
			],
		});

		const dynamicRun = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "a"],
			extensionRegistry: registry,
		});
		expect(await dynamicRun.exit).toBe(0);
		expect(dynamicRun.stdout.join("")).toBe("alpha\n");
		expect(dynamicRun.stderr.join("")).toBe("");

		const optionRun = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "--"],
			extensionRegistry: registry,
		});
		expect(await optionRun.exit).toBe(0);
		expect(optionRun.stdout.join("")).toContain("--loud\n");
		expect(optionRun.stderr.join("")).toBe("");
		expect(registry.loadLog).toEqual(["hello", "hello"]);
	});

	test("selected command dynamic provider failure preserves static candidates", async () => {
		const registry = fakeCompletionRegistry({
			commands: [
				helloCommand({
					schema: z.object({ mode: z.enum(["fast", "slow"]).optional() }),
					positionals: { mode: { position: 0 } },
					completionProvider() {
						throw new Error("provider boom");
					},
				}),
			],
		});
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", "f"],
			extensionRegistry: registry,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("fast\n");
		expect(run.stderr.join("")).toContain("provider boom");
		expect(registry.loadLog).toEqual(["hello"]);
	});

	test("hidden resolver is omitted from completion help", async () => {
		const run = runWithFakes({
			args: ["completion", "--help"],
			extensionRegistry: fakeCompletionRegistry(),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("bash");
		expect(run.stdout.join("")).not.toContain("resolve");
	});
});

interface FakeCompletionRegistryOptions {
	commands?: readonly SdlCommand[];
	loadFailures?: Readonly<Record<string, string>>;
}

interface FakeCompletionRegistry {
	loadLog: string[];
	loadCommandCatalog: NonNullable<
		NonNullable<SdlCliDeps["extensionRegistry"]>["loadCommandCatalog"]
	>;
	loadSelectedCommand: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedSdlCommandLoadResult>;
}

function fakeCompletionRegistry(
	options: FakeCompletionRegistryOptions = {},
): FakeCompletionRegistry {
	const commands = options.commands ?? [];
	const candidates = commands.map(commandCandidate);
	const candidateMap = new Map(candidates.map((candidate) => [candidate.name, candidate]));
	const loadLog: string[] = [];
	return {
		loadLog,
		async loadCommandCatalog(_options) {
			return {
				candidates: candidateMap,
				commandInfos: candidates.map(({ name, description, fullDescription }) => ({
					name,
					description,
					fullDescription,
				})),
				diagnostics: [],
			};
		},
		async loadSelectedCommand(candidate) {
			loadLog.push(candidate.name);
			const failure = options.loadFailures?.[candidate.name];
			if (failure !== undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_load_failed",
						message: failure,
						commandName: candidate.name,
					},
				};
			}
			const command = commands.find((entry) => entry.name === candidate.name);
			if (command === undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_command_missing",
						message: `Missing fake command ${candidate.name}`,
						commandName: candidate.name,
					},
				};
			}
			return {
				ok: true,
				command,
				source: { level: "project", label: `fake ${candidate.name}` },
				path: { name: candidate.name },
			};
		},
	};
}

function commandCandidate(command: SdlCommand): ExtensionCommandCandidate {
	return {
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
		source: { level: "project", label: `fake ${command.name}` },
		entryPath: `fake://${command.name}`,
		kind: "file",
	};
}

function helloCommand(options: Partial<SdlCommand> = {}): SdlCommand {
	return {
		name: "hello",
		summary: "Hello",
		description: "Hello",
		async run() {
			return { ok: true, message: "hello" };
		},
		...options,
	};
}

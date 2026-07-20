import { z } from "zod";

import { describe, expect, test } from "vitest";

import { commandKey } from "../../src/extensions/command-registry.ts";
import type { NsCliDeps } from "../../src/cli/index.ts";
import type {
	ExtensionCommandCandidate,
	SelectedNsCommandLoadResult,
} from "../../src/extensions/registry.ts";
import { runCliWithFakes, type RunWithFakesOptions } from "./ns-cli-fakes.ts";
import { defineCommand, ok, type DefineCommandSpec, type NsCommand } from "@nseng-ai/sdk";

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}

describe("ns completion CLI", () => {
	test("prints dynamic setup scripts for supported shells", async () => {
		for (const shell of ["bash", "zsh", "fish"] as const) {
			const run = runWithFakes({
				args: ["completion", shell],
				extensionRegistry: fakeCompletionRegistry(),
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("'ns' 'completion' 'exec' 'resolve'");
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

	test.each([
		{
			name: "top-level project command",
			path: ["hello"],
			candidate: { name: "hello" },
			command: helloCommand({
				name: "hello",
				schema: z.object({ isTopLevel: z.boolean().default(false) }),
			}),
			prefix: "--is-top-l",
			expected: "--is-top-level\n",
			expectedLoadLog: ["hello"],
		},
		{
			name: "one-level grouped project command",
			path: ["tools", "scan"],
			candidate: { group: "tools", name: "scan", sourceLevel: "project" as const },
			command: helloCommand({
				name: "scan",
				schema: z.object({ isGrouped: z.boolean().default(false) }),
			}),
			prefix: "--is-group",
			expected: "--is-grouped\n",
			expectedLoadLog: ["tools/scan"],
		},
		{
			name: "two-segment preinstalled command path",
			path: ["workspace", "clean"],
			candidate: {
				name: "clean",
				segments: ["workspace", "clean"],
				sourceLevel: "preinstalled" as const,
			},
			command: helloCommand({
				name: "clean",
				schema: z.object({ shouldDeleteBranches: z.boolean().default(false) }),
			}),
			prefix: "--should-delete-br",
			expected: "--should-delete-branches\n",
			expectedLoadLog: ["workspace/clean"],
		},
		{
			name: "three-segment command path",
			path: ["review-tools", "review", "run"],
			candidate: { name: "run", segments: ["review-tools", "review", "run"] },
			command: helloCommand({
				name: "run",
				schema: z.object({ shouldReviewProfile: z.boolean().default(false) }),
			}),
			prefix: "--should-review-pro",
			expected: "--should-review-profile\n",
			expectedLoadLog: ["review-tools/review/run"],
		},
		{
			name: "nested exec command path",
			path: ["workspace", "graph", "exec", "stack-branches"],
			candidate: {
				name: "stack-branches",
				segments: ["workspace", "graph", "exec", "stack-branches"],
			},
			command: helloCommand({
				name: "stack-branches",
				schema: z.object({ isDownstackOnly: z.boolean().default(false) }),
			}),
			prefix: "--is-downstack-o",
			expected: "--is-downstack-only\n",
			expectedLoadLog: ["workspace/graph/exec/stack-branches"],
		},
	])(
		"selected extension option completion loads the selected command for $name",
		async (testCase) => {
			const registry = fakeCompletionRegistry({
				commands: [testCase.command],
				paths: { [testCase.command.name]: testCase.candidate },
			});
			const run = runWithFakes({
				args: ["completion", "exec", "resolve", "--", ...testCase.path, testCase.prefix],
				extensionRegistry: registry,
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toBe(testCase.expected);
			expect(run.stderr.join("")).toBe("");
			expect(registry.loadLog).toEqual(testCase.expectedLoadLog);
		},
	);

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

	test("dynamic completion receives the command catalog extension-presence fact", async () => {
		const registry = fakeCompletionRegistry({
			extensionPackageNames: new Set(["@example/present"]),
			commands: [
				helloCommand({
					completionProvider(ctx) {
						return ["@example/present", "@example/absent"]
							.filter((packageName) => ctx.hasExtension(packageName))
							.map((value) => ({ value, type: "positional-value" }));
					},
				}),
			],
		});
		const run = runWithFakes({
			args: ["completion", "exec", "resolve", "--", "hello", ""],
			extensionRegistry: registry,
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("@example/present\n");
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
		expect(run.stderr.join("")).toBe("");
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

interface FakeCompletionPath {
	group?: string;
	segments?: readonly string[];
	sourceLevel?: "preinstalled" | "project";
}

interface FakeCompletionRegistryOptions {
	commands?: readonly NsCommand[];
	extensionPackageNames?: ReadonlySet<string>;
	loadFailures?: Readonly<Record<string, string>>;
	paths?: Readonly<Record<string, FakeCompletionPath>>;
}

interface FakeCompletionRegistry {
	loadLog: string[];
	loadCommandCatalog: NonNullable<
		NonNullable<NsCliDeps["extensionRegistry"]>["loadCommandCatalog"]
	>;
	loadSelectedCommand: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
}

function fakeCompletionRegistry(
	options: FakeCompletionRegistryOptions = {},
): FakeCompletionRegistry {
	const entries = (options.commands ?? []).map((command) => {
		const candidate = commandCandidate(command, options.paths?.[command.name]);
		return { key: commandKey(candidate), command, candidate };
	});
	const candidateMap = new Map(entries.map((entry) => [entry.key, entry.candidate]));
	const loadLog: string[] = [];
	return {
		loadLog,
		async loadCommandCatalog(_options) {
			return {
				candidates: candidateMap,
				commandInfos: entries.map(({ candidate }) => ({
					...commandPathFields(candidate),
					name: candidate.name,
					description: candidate.description,
					fullDescription: candidate.fullDescription,
				})),
				diagnostics: [],
				extensionPackageNames: options.extensionPackageNames ?? new Set(),
			};
		},
		async loadSelectedCommand(candidate) {
			const key = commandKey(candidate);
			loadLog.push(key);
			const failure = options.loadFailures?.[key] ?? options.loadFailures?.[candidate.name];
			if (failure !== undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_load_failed",
						message: failure,
						commandName: key,
					},
				};
			}
			const entry = entries.find((candidateEntry) => candidateEntry.key === key);
			if (entry === undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_command_missing",
						message: `Missing fake command ${key}`,
						commandName: key,
					},
				};
			}
			return {
				ok: true,
				loaded: { kind: "raw-command", command: entry.command },
				source: entry.candidate.source,
				path: { ...commandPathFields(entry.candidate), name: entry.candidate.name },
			};
		},
	};
}

function commandPathFields(path: { group?: string; segments?: readonly string[] }): {
	group?: string;
	segments?: readonly string[];
} {
	return {
		...(path.group === undefined ? {} : { group: path.group }),
		...(path.segments === undefined ? {} : { segments: path.segments }),
	};
}

function commandCandidate(
	command: NsCommand,
	path: FakeCompletionPath = {},
): ExtensionCommandCandidate {
	const candidatePath = { ...commandPathFields(path), name: command.name };
	const key = commandKey(candidatePath);
	return {
		kind: "raw-command",
		...candidatePath,
		description: command.summary,
		fullDescription: command.description,
		source: { level: path.sourceLevel ?? "project", label: `fake ${key}` },
		moduleReference: { type: "file", path: `fake://${key}` },
		entryPath: `fake://${key}`,
		hasStaticCommandInfo: false,
	};
}

function helloCommand(options: Partial<DefineCommandSpec<z.ZodObject, string>> = {}): NsCommand {
	return defineCommand({
		name: "hello",
		summary: "Hello",
		description: "Hello",
		schema: z.object({}),
		resultSchema: z.string(),
		handler: async () => ok("hello"),
		...options,
	});
}

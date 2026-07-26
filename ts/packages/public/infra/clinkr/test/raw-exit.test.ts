import { z } from "zod";
import { describe, expect, test } from "vitest";

import { LegacyClinkrGroup, ok, type ClinkrCommandSpec } from "../src/index.ts";
import { rawCommand } from "../src/raw/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

describe("raw-exit escape hatch", () => {
	describe("handler exit code round-trip", () => {
		test("exit 0 passes through", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "ok",
					run: async () => 0,
				}),
			);
			const run = await runForTest(group, ["ok"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toBe("");
			expect(run.stderr).toBe("");
		});

		test("exit 1 passes through", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "fail",
					run: async () => 1,
				}),
			);
			const run = await runForTest(group, ["fail"], { context: null });
			expect(run.exitCode).toBe(1);
			expect(run.stdout).toBe("");
			expect(run.stderr).toBe("");
		});

		test("exit 2 passes through", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "err",
					run: async () => 2,
				}),
			);
			const run = await runForTest(group, ["err"], { context: null });
			expect(run.exitCode).toBe(2);
		});

		test("exit 124 passes through", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "timeout",
					run: async () => 124,
				}),
			);
			const run = await runForTest(group, ["timeout"], { context: null });
			expect(run.exitCode).toBe(124);
		});

		test("arbitrary exit code passes through", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "custom",
					run: async () => 42,
				}),
			);
			const run = await runForTest(group, ["custom"], { context: null });
			expect(run.exitCode).toBe(42);
		});
	});

	describe("argv ownership", () => {
		test("passes framework-looking flags through unchanged", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			let received: readonly string[] = [];
			group.command(
				rawCommand({
					name: "act",
					run: async (_ctx, invocation) => {
						received = invocation.argv;
						return 0;
					},
				}),
			);
			const run = await runForTest(group, ["act", "--format", "json", "--json-schema"], {
				context: null,
			});
			expect(run.exitCode).toBe(0);
			expect(received).toEqual(["--format", "json", "--json-schema"]);
		});

		test("raw commands own leaf help", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					description: "An action",
					run: async (_ctx, invocation) => (invocation.argv[0] === "--help" ? 7 : 0),
				}),
			);
			const run = await runForTest(group, ["act", "--help"], { context: null });
			expect(run).toMatchObject({ exitCode: 7, stdout: "", stderr: "" });
		});

		test("normal command help shows rendered-command flags", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command({
				name: "act",
				description: "An action",
				schema: z.object({ value: z.number() }),
				resultSchema: z.any(),
				handler: async () => ok(5),
			});
			const run = await runForTest(group, ["act", "--help"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("--format");
			expect(run.stdout).not.toContain("--shell" + "-exit-code");
		});
	});

	describe("unexpected exceptions", () => {
		test("raw commands propagate thrown errors unchanged", async () => {
			const error = new Error("something went wrong");
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					run: async () => {
						throw error;
					},
				}),
			);
			await expect(runForTest(group, ["act"], { context: null })).rejects.toBe(error);
		});
	});

	describe("illegal raw spec states are unrepresentable", () => {
		test("rendered command specs cannot opt into raw mode", () => {
			const schema = z.object({});
			const spec: ClinkrCommandSpec<null, typeof schema, number> = {
				name: "act",
				schema,
				resultSchema: z.any(),
				handler: async () => ok(0),
				// @ts-expect-error rendered specs cannot set the raw discriminant
				isRawExit: true,
			};
			expect(spec.name).toBe("act");
		});

		test("rawCommand cannot accept rendered-only renderHuman", () => {
			const spec = rawCommand({
				name: "act",
				run: async () => 0,
				// @ts-expect-error raw command options do not include rendered-only hooks
				renderHuman: () => "rendered",
			});
			expect(spec.name).toBe("act");
		});
	});

	describe("summary field", () => {
		test("summary appears in parent group help", async () => {
			const parent = new LegacyClinkrGroup<null>({ name: "parent" });
			const child = new LegacyClinkrGroup<null>({ name: "child" });
			child.command(
				rawCommand({
					name: "act",
					description: "Full description",
					summary: "Short summary",
					run: async () => 0,
				}),
			);
			parent.group(child);
			const run = await runForTest(parent, ["child"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("act");
			expect(run.stdout).toContain("Short summary");
		});
	});

	describe("mixed raw + normal leaves in one group", () => {
		test("raw and normal commands coexist in same group", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "raw-act",
					run: async () => 42,
				}),
			);
			group.command({
				name: "normal-act",
				schema: z.object({}),
				resultSchema: z.any(),
				handler: async () => ok({ value: "data" }),
			});
			const rawRun = await runForTest(group, ["raw-act"], { context: null });
			expect(rawRun.exitCode).toBe(42);
			expect(rawRun.stdout).toBe("");

			const normalRun = await runForTest(group, ["normal-act"], { context: null });
			expect(normalRun.exitCode).toBe(0);
			expect(normalRun.stdout).toContain("value");
		});

		test("raw owns flags while normal commands retain framework parsing", async () => {
			const group = new LegacyClinkrGroup<null>({ name: "test" });
			let rawArgv: readonly string[] = [];
			group.command(
				rawCommand({
					name: "raw-act",
					run: async (_ctx, invocation) => {
						rawArgv = invocation.argv;
						return 0;
					},
				}),
			);
			group.command({
				name: "normal-act",
				schema: z.object({}),
				resultSchema: z.any(),
				handler: async () => ok({ value: "data" }),
			});
			const rawRun = await runForTest(group, ["raw-act", "--format", "json"], { context: null });
			expect(rawRun.exitCode).toBe(0);
			expect(rawArgv).toEqual(["--format", "json"]);
			const removedNegativeFlagRun = await runForTest(
				group,
				["normal-act", "--shell" + "-exit-code"],
				{
					context: null,
				},
			);
			expect(removedNegativeFlagRun.exitCode).toBe(2);
			expect(removedNegativeFlagRun.stderr).toContain("unknown option");

			const normalRun = await runForTest(group, ["normal-act", "--format", "json"], {
				context: null,
			});
			expect(normalRun.exitCode).toBe(0);
			const envelope = parseEnvelope(normalRun.stdout);
			expect(envelope.exitCode).toBe(0);
		});
	});

	describe("handler stdout/stderr ownership", () => {
		interface RawIoContext {
			stdout: (text: string) => void;
			stderr: (text: string) => void;
		}

		test("raw command emits only handler-owned bytes through invocation io", async () => {
			const group = new LegacyClinkrGroup<RawIoContext>({ name: "test" });
			group.command(
				rawCommand({
					name: "speak",
					run: async (_ctx, invocation) => {
						invocation.io.stdout("handler out\n");
						invocation.io.stderr("handler err\n");
						return 3;
					},
				}),
			);
			let stdout = "";
			let stderr = "";
			const run = await runForTest(group, ["speak"], {
				context: {
					stdout: (text) => {
						stdout += text;
					},
					stderr: (text) => {
						stderr += text;
					},
				},
			});
			expect(run.exitCode).toBe(3);
			expect(run.stdout).toBe("handler out\n");
			expect(run.stderr).toBe("handler err\n");
			expect(stdout).toBe("");
			expect(stderr).toBe("");
		});
	});
});

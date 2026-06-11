import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ClinkrFailure, negative, ok } from "../src/index.ts";
import { rawCommand } from "../src/raw/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

describe("raw-exit escape hatch", () => {
	describe("handler exit code round-trip", () => {
		test("exit 0 passes through", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "ok",
					schema: z.object({}),
					run: async () => 0,
				}),
			);
			const run = await runForTest(group, ["ok"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toBe("");
			expect(run.stderr).toBe("");
		});

		test("exit 1 passes through", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "fail",
					schema: z.object({}),
					run: async () => 1,
				}),
			);
			const run = await runForTest(group, ["fail"], { context: null });
			expect(run.exitCode).toBe(1);
			expect(run.stdout).toBe("");
			expect(run.stderr).toBe("");
		});

		test("exit 2 passes through", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "err",
					schema: z.object({}),
					run: async () => 2,
				}),
			);
			const run = await runForTest(group, ["err"], { context: null });
			expect(run.exitCode).toBe(2);
		});

		test("exit 124 passes through", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "timeout",
					schema: z.object({}),
					run: async () => 124,
				}),
			);
			const run = await runForTest(group, ["timeout"], { context: null });
			expect(run.exitCode).toBe(124);
		});

		test("arbitrary exit code passes through", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "custom",
					schema: z.object({}),
					run: async () => 42,
				}),
			);
			const run = await runForTest(group, ["custom"], { context: null });
			expect(run.exitCode).toBe(42);
		});
	});

	describe("--format suppression", () => {
		test("--format is not available on raw commands", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					schema: z.object({}),
					run: async () => 0,
				}),
			);
			const run = await runForTest(group, ["act", "--format", "json"], { context: null });
			expect(run.exitCode).toBe(2);
			expect(run.stderr).toContain("unknown option '--format'");
		});
	});

	describe("--json-schema option", () => {
		test("--json-schema is available on raw commands", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					schema: z.object({ value: z.number() }),
					run: async () => 0,
				}),
			);
			const run = await runForTest(group, ["act", "--json-schema"], { context: null });
			expect(run.exitCode).toBe(0);
			const schema = JSON.parse(run.stdout);
			expect(schema).toHaveProperty("input_json_schema");
			expect(schema).toHaveProperty("output_json_schema");
		});
	});

	describe("leaf help", () => {
		test("raw command help shows schema options and --json-schema, no --format", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					description: "An action",
					schema: z.object({ value: z.number() }),
					run: async () => 0,
				}),
			);
			const run = await runForTest(group, ["act", "--help"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("--value");
			expect(run.stdout).toContain("--json-schema");
			expect(run.stdout).not.toContain("--format");
		});

		test("normal command help shows --format", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command({
				name: "act",
				description: "An action",
				schema: z.object({ value: z.number() }),
				handler: async () => ok(5),
			});
			const run = await runForTest(group, ["act", "--help"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("--format");
		});
	});

	describe("zod usage errors", () => {
		test("zod validation errors exit 2, raw stderr, handler not invoked", async () => {
			let handlerInvoked = false;
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					schema: z.object({ value: z.number() }),
					run: async () => {
						handlerInvoked = true;
						return 0;
					},
				}),
			);
			const run = await runForTest(group, ["act", "--value", "not-a-number"], { context: null });
			expect(run.exitCode).toBe(2);
			expect(run.stderr).toContain("error");
			expect(handlerInvoked).toBe(false);
		});
	});

	describe("ClinkrFailure handling", () => {
		test("ClinkrFailure converts to stderr error message, exit 2", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					schema: z.object({}),
					run: async () => {
						throw new ClinkrFailure({
							errorType: "test_error",
							message: "something went wrong",
						});
					},
				}),
			);
			const run = await runForTest(group, ["act"], { context: null });
			expect(run.exitCode).toBe(2);
			expect(run.stderr).toBe("error: something went wrong\n");
		});
	});

	describe("non-number ok data invariant", () => {
		test("returns invariant error when handler returns non-number in ok", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command({
				name: "act",
				schema: z.object({}),
				handler: async () => ok("not a number"),
				isRawExit: true,
			});
			let errorThrown: Error | undefined;
			try {
				await group.run(["act"], { context: null });
			} catch (error) {
				errorThrown = error as Error;
			}
			expect(errorThrown).toBeDefined();
			expect(errorThrown?.message).toContain("raw command handler must return ok(exitCode: number)");
		});
	});

	describe("summary field", () => {
		test("summary appears in parent group help", async () => {
			const parent = new ClinkrGroup<null>({ name: "parent" });
			const child = new ClinkrGroup<null>({ name: "child" });
			child.command(
				rawCommand({
					name: "act",
					description: "Full description",
					summary: "Short summary",
					schema: z.object({}),
					run: async () => 0,
				}),
			);
			parent.group(child);
			const run = await runForTest(parent, ["child"], { context: null });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("act");
			expect(run.stdout).toContain("Short summary");
		});

		test("summary vs description: summary in parent help, description in leaf", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "act",
					description: "Full description text",
					summary: "Short",
					schema: z.object({}),
					run: async () => 0,
				}),
			);
			// Check leaf help has description, not summary
			const leafRun = await runForTest(group, ["act", "--help"], { context: null });
			expect(leafRun.stdout).toContain("Full description text");
			// Summary would appear in parent group list, but we're testing the command itself
		});
	});

	describe("mixed raw + normal leaves in one group", () => {
		test("raw and normal commands coexist in same group", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "raw-act",
					schema: z.object({}),
					run: async () => 42,
				}),
			);
			group.command({
				name: "normal-act",
				schema: z.object({}),
				handler: async () => ok({ value: "data" }),
			});
			const rawRun = await runForTest(group, ["raw-act"], { context: null });
			expect(rawRun.exitCode).toBe(42);
			expect(rawRun.stdout).toBe("");

			const normalRun = await runForTest(group, ["normal-act"], { context: null });
			expect(normalRun.exitCode).toBe(0);
			expect(normalRun.stdout).toContain("value");
		});

		test("raw command does not accept --format, normal does", async () => {
			const group = new ClinkrGroup<null>({ name: "test" });
			group.command(
				rawCommand({
					name: "raw-act",
					schema: z.object({}),
					run: async () => 0,
				}),
			);
			group.command({
				name: "normal-act",
				schema: z.object({}),
				handler: async () => ok({ value: "data" }),
			});
			const rawRun = await runForTest(group, ["raw-act", "--format", "json"], { context: null });
			expect(rawRun.exitCode).toBe(2);
			expect(rawRun.stderr).toContain("unknown option");

			const normalRun = await runForTest(group, ["normal-act", "--format", "json"], {
				context: null,
			});
			expect(normalRun.exitCode).toBe(0);
			const envelope = parseEnvelope(normalRun.stdout);
			expect(envelope.exit_code).toBe(0);
		});
	});

	describe("handler stdout/stderr ownership", () => {
		interface RawIoContext {
			stdout: (text: string) => void;
			stderr: (text: string) => void;
		}

		test("raw command emits only handler-owned bytes via context io sinks", async () => {
			const group = new ClinkrGroup<RawIoContext>({ name: "test" });
			group.command(
				rawCommand({
					name: "speak",
					schema: z.object({}),
					run: async (ctx) => {
						ctx.stdout("handler out\n");
						ctx.stderr("handler err\n");
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
			expect(run.stdout).toBe("");
			expect(run.stderr).toBe("");
			expect(stdout).toBe("handler out\n");
			expect(stderr).toBe("handler err\n");
		});
	});
});

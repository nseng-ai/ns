import { z } from "zod";
import { describe, expect, test } from "vitest";

import { negative } from "../src/exit.ts";
import { ClinkrFailure } from "../src/failure.ts";
import { ClinkrGroup } from "../src/group.ts";
import { legacyCommand, legacyMachine, type LegacyPayload } from "../src/legacy/index.ts";
import { runForTest } from "../src/testing/index.ts";

const ERROR_TYPE = "probe_error";

function buildGroup(run: () => Promise<LegacyPayload>): ClinkrGroup<null> {
	const group = new ClinkrGroup<null>({ name: "probe" });
	group.command(
		legacyCommand({
			name: "act",
			description: "Probe command.",
			schema: z.object({}),
			errorType: ERROR_TYPE,
			run,
		}),
	);
	return group;
}

describe("legacyCommand ok channel", () => {
	test("json format writes the exact compact success body with exit 0", async () => {
		const group = buildGroup(async () => ({
			machine: { slug: "x", count: 2 },
			human: "Slug: x",
		}));
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{"success":true,"slug":"x","count":2}\n');
		expect(run.stderr).toBe("");
	});

	test("machine body never contains a __human key", async () => {
		const group = buildGroup(async () => ({
			machine: { slug: "x" },
			human: "Slug: x",
		}));
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.stdout).not.toContain("__human");
	});

	test("human format writes payload.human plus one newline", async () => {
		const group = buildGroup(async () => ({
			machine: { slug: "x" },
			human: "Slug: x\nBranch: y",
		}));
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("Slug: x\nBranch: y\n");
	});

	test("machine keys keep their spread order in the body", async () => {
		const group = buildGroup(async () => ({
			machine: { zebra: 1, alpha: 2, mid: 3 },
			human: "irrelevant",
		}));
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.stdout).toBe('{"success":true,"zebra":1,"alpha":2,"mid":3}\n');
	});
});

describe("legacyCommand failure channel", () => {
	test("a plain Error becomes the legacy failure body with exit 2 under json", async () => {
		const group = buildGroup(async () => {
			throw new Error("disk on fire");
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe(
			'{"success":false,"error":{"code":"probe_error","message":"disk on fire"}}\n',
		);
	});

	test("a plain Error renders as stderr `error: message` under human", async () => {
		const group = buildGroup(async () => {
			throw new Error("disk on fire");
		});
		const run = await runForTest(group, ["act"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("error: disk on fire\n");
	});

	test("a non-Error throw is stringified", async () => {
		const group = buildGroup(async () => {
			throw "raw string failure";
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe(
			'{"success":false,"error":{"code":"probe_error","message":"raw string failure"}}\n',
		);
	});

	test("a thrown ClinkrFailure keeps its own errorType as error.code", async () => {
		const group = buildGroup(async () => {
			throw new ClinkrFailure({ errorType: "custom_code", message: "specific" });
		});
		const run = await runForTest(group, ["act", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe(
			'{"success":false,"error":{"code":"custom_code","message":"specific"}}\n',
		);
	});
});

describe("legacyCommand surface passthrough", () => {
	test("positionals reach the run callback", async () => {
		const group = new ClinkrGroup<null>({ name: "probe" });
		group.command(
			legacyCommand({
				name: "act",
				schema: z.object({ key: z.string().optional() }),
				positionals: { key: { position: 0 } },
				errorType: ERROR_TYPE,
				run: async (_ctx, request) => ({
					machine: { key: request.key ?? null },
					human: `Key: ${request.key}`,
				}),
			}),
		);
		const run = await runForTest(group, ["act", "my-key", "--format", "json"], { context: null });
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe('{"success":true,"key":"my-key"}\n');
	});
});

describe("legacyMachine negative parity branch", () => {
	test("a negative exit maps to the failure body with the command errorType", () => {
		const output = legacyMachine(ERROR_TYPE)(negative("nothing to do"));
		expect(output).toEqual({
			body: { success: false, error: { code: "probe_error", message: "nothing to do" } },
			exitCode: 2,
			serialization: "compact",
		});
	});
});

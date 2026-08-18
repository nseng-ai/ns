import { describe, expect, test } from "vitest";

import { RealGsConsumerGateway } from "../src/gs-gateway.ts";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";

function commands(result: { code: number; stdout?: string; stderr?: string }) {
	const calls: Array<{ command: string; args: string[] }> = [];
	const api: CommandExecApi = {
		async exec(command, args) {
			calls.push({ command, args: [...args] });
			return {
				type: "exited",
				code: result.code,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				signal: null,
			};
		},
	};
	return { api, calls };
}

describe("RealGsConsumerGateway", () => {
	test("uses only machine-readable stack inspection and hides private JSON", async () => {
		const fixture = commands({
			code: 0,
			stdout: JSON.stringify({
				trunk: "main",
				currentBranch: "feature",
				branches: [{ name: "feature" }],
			}),
		});
		const gateway = new RealGsConsumerGateway(fixture.api);

		expect(await gateway.inspectLocalStack({ cwd: "/repo" })).toEqual({
			ok: true,
			value: { type: "stacked", currentBranch: "feature", orderedBranches: ["feature"] },
		});
		expect(fixture.calls).toEqual([{ command: "gh", args: ["stack", "view", "--json"] }]);
	});

	test("maps exit 2 inspection to unstacked", async () => {
		const fixture = commands({ code: 2 });
		expect(
			await new RealGsConsumerGateway(fixture.api).inspectLocalStack({ cwd: "/repo" }),
		).toEqual({
			ok: true,
			value: { type: "unstacked" },
		});
	});

	test.each([
		[2, "gs-not-in-stack"],
		[4, "gs-github-api-failed"],
		[5, "gs-invalid-arguments"],
		[6, "gs-disambiguation-required"],
		[8, "gs-metadata-locked"],
		[9, "gs-unavailable"],
	] as const)("classifies exit %i", async (code, expectedCode) => {
		const fixture = commands({ code, stderr: "detail" });
		const result = await new RealGsConsumerGateway(fixture.api).addAboveCurrentStack({
			cwd: "/repo",
			targetBranch: "target",
		});
		expect(result).toMatchObject({ ok: false, error: { code: expectedCode } });
		if (!result.ok) expect(result.error.message).toContain("detail");
	});

	test("rejects malformed JSON", async () => {
		const fixture = commands({ code: 0, stdout: "{" });
		const result = await new RealGsConsumerGateway(fixture.api).inspectLocalStack({ cwd: "/repo" });
		expect(result).toMatchObject({ ok: false, error: { code: "gs-view-malformed-json" } });
	});

	test("rejects malformed topology data", async () => {
		const fixture = commands({
			code: 0,
			stdout: JSON.stringify({ currentBranch: "feature", branches: "feature" }),
		});
		const result = await new RealGsConsumerGateway(fixture.api).inspectLocalStack({ cwd: "/repo" });
		expect(result).toMatchObject({ ok: false, error: { code: "gs-view-malformed" } });
	});

	test.each([
		[{ currentBranch: "feature", branches: [{ name: "feature" }, {}] }],
		[{ currentBranch: "feature", branches: [{ name: "feature" }, { branch: "  " }] }],
	] as const)("rejects mixed valid and malformed branch entries", async (topology) => {
		const fixture = commands({ code: 0, stdout: JSON.stringify(topology) });
		const result = await new RealGsConsumerGateway(fixture.api).inspectLocalStack({ cwd: "/repo" });
		expect(result).toMatchObject({ ok: false, error: { code: "gs-view-malformed" } });
	});

	test("builds explicit init argv", async () => {
		const fixture = commands({ code: 0 });
		await new RealGsConsumerGateway(fixture.api).initializeStack({
			cwd: "/repo",
			trunkBranch: "main",
			branches: ["feature", "target"],
		});
		expect(fixture.calls[0]).toEqual({
			command: "gh",
			args: ["stack", "init", "--base", "main", "feature", "target"],
		});
	});
});

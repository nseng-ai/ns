import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import { initNs, renderInitNsHuman } from "../../src/init-ns.ts";
import type { NsActivationContext } from "../../src/activation-context.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/testing/index.ts";

function fixture(nsToml?: string): {
	context: NsActivationContext;
	files: InMemoryActivationFilesGateway;
} {
	const files = new InMemoryActivationFilesGateway({
		files: nsToml === undefined ? {} : { "ns.toml": nsToml },
	});
	return {
		context: {
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
			files,
			declaredExtensions: new InMemoryDeclaredExtensionsGateway(),
			artifacts: new InMemoryArtifactActivationGateway(),
		},
		files,
	};
}

describe("initNs", () => {
	it("requires --harness on first activation", async () => {
		const { context } = fixture();
		const result = await initNs(context, { cwd: "/repo", harness: [] });
		expect(result).toMatchObject({ type: "usageError", data: { argument: "harness" } });
	});

	it("computes config before writing and activates with generic structured outcomes", async () => {
		const { context, files } = fixture();
		const result = await initNs(context, { cwd: "/repo", harness: ["codex", "claude-code"] });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.data).toMatchObject({
			repoRoot: "/repo",
			trunkBranch: "main",
			harnesses: ["codex", "claude-code"],
			harnessSource: "explicit",
			completed: {
				nsToml: { change: "created" },
				agentsInstructionFile: { change: "created" },
				generatedInstructionsFile: { change: "created" },
				consumerDirectories: [],
				artifacts: [],
			},
		});
		expect(files.fileContent("ns.toml")).toBe('harnesses = ["codex","claude-code"]\n');
	});

	it("uses persisted harnesses and reports an idempotent rerun", async () => {
		const nsToml = 'harnesses = ["pi"]\n';
		const { context, files } = fixture(nsToml);
		const first = await initNs(context, { cwd: "/repo", harness: [] });
		expect(first.type).toBe("ok");
		files.operations();
		const second = await initNs(context, { cwd: "/repo", harness: [] });
		expect(second).toMatchObject({
			type: "ok",
			data: {
				harnessSource: "ns-toml",
				completed: {
					nsToml: { change: "unchanged" },
					agentsInstructionFile: { change: "unchanged" },
					generatedInstructionsFile: { change: "unchanged" },
				},
			},
		});
	});

	it("renders a per-duty human report and omits empty sections", async () => {
		const { context } = fixture();
		const result = await initNs(context, { cwd: "/repo", harness: ["codex", "claude-code"] });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(renderInitNsHuman(result.data)).toBe(
			[
				"Activated ns in /repo.",
				"Harnesses (explicit): codex, claude-code.",
				"Files:",
				"  ns.toml              created",
				"  AGENTS.md            created",
				"  CLAUDE.md            created",
				"  .ns/instructions.md  created",
			].join("\n"),
		);
	});

	it("returns aggregated preflight failure data with an empty completion map", async () => {
		const { context, files } = fixture('harnesses = ["pi"]\nextensions = [42]\n');
		const result = await initNs(context, { cwd: "/repo", harness: [] });
		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-init-preflight-failed",
			data: { phase: "preflight", completed: {} },
		});
		expect(files.operations()).toEqual([]);
	});
});

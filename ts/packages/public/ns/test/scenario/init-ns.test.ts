import { describe, expect, it } from "vitest";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { initNs, renderInitNsHuman } from "../../src/init/init-ns.ts";
import type { NsActivationContext } from "../../src/init/activation-context.ts";
import {
	CollectingLifecycleTraceSink,
	InMemoryActivationFilesGateway,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/init/testing/index.ts";

function fixture(nsToml?: string) {
	const files = new InMemoryActivationFilesGateway({
		files: nsToml === undefined ? {} : { "ns.toml": nsToml },
	});
	const context: NsActivationContext = {
		git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", cachedOriginHeadBranch: "main" }),
		files,
		declaredExtensions: new InMemoryDeclaredExtensionsGateway(),
	};
	return { context, files };
}

describe("initNs", () => {
	it("creates activation files from an empty project", async () => {
		const { context, files } = fixture();
		const result = await initNs(context, { cwd: "/repo" });
		expect(result).toMatchObject({
			status: "success",
			data: {
				repoRoot: "/repo",
				trunkBranch: "main",
				completed: {
					files: {
						"ns-toml": { change: "created" },
						"managed-extensions-ignore": { change: "created" },
						"agents-instructions": { change: "created" },
						"generated-instructions": { change: "created" },
					},
					consumerDirectories: [],
				},
			},
		});
		expect(files.fileContent("ns.toml")).toBe("");
	});
	it("streams deterministic lifecycle history", async () => {
		const { context } = fixture();
		const trace = new CollectingLifecycleTraceSink();
		const result = await initNs({ ...context, lifecycleTrace: trace }, { cwd: "/repo" });
		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(trace.collectedLines()).toHaveLength(result.data.steps.length);
		expect(result.data.steps.at(-1)).toEqual({
			type: "phase",
			phase: "completion",
			status: "completed",
		});
	});
	it("preserves completed duties when apply fails", async () => {
		const files = new InMemoryActivationFilesGateway({
			writeFailures: { "AGENTS.md": { code: "write-failed", message: "failed" } },
		});
		const context: NsActivationContext = {
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", cachedOriginHeadBranch: "main" }),
			files,
			declaredExtensions: new InMemoryDeclaredExtensionsGateway(),
		};
		const result = await initNs(context, { cwd: "/repo" });
		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-init-apply-failed",
			data: {
				completed: {
					files: {
						"ns-toml": { change: "created" },
						"managed-extensions-ignore": { change: "created" },
					},
				},
			},
		});
	});
	it("is idempotent for existing activation files", async () => {
		const { context } = fixture("");
		const first = await initNs(context, { cwd: "/repo" });
		const second = await initNs(context, { cwd: "/repo" });
		expect(first.status).toBe("success");
		expect(second).toMatchObject({
			status: "success",
			data: { completed: { files: { "ns-toml": { change: "unchanged" } } } },
		});
	});
	it("renders files and consumer directories without removed automatic sections", () => {
		expect(
			renderInitNsHuman({
				repoRoot: "/repo",
				trunkBranch: "main",
				completed: {
					files: { "ns-toml": { change: "unchanged" } },
					consumerDirectories: [{ path: ".ns/data", change: "created" }],
				},
				steps: [],
			}),
		).toBe(
			"Activated ns in /repo.\nFiles:\n  ns.toml  unchanged\nConsumer directories:\n  .ns/data  created",
		);
	});
	it("returns aggregated extension-config preflight failures without writes", async () => {
		const { context, files } = fixture("extensions = [42]\n");
		const result = await initNs(context, { cwd: "/repo" });
		expect(result).toMatchObject({
			status: "failure",
			errorType: "ns-init-preflight-failed",
			data: { completed: {}, diagnostics: [{ code: "invalid-extensions" }] },
		});
		expect(files.operations()).toEqual([]);
	});
});

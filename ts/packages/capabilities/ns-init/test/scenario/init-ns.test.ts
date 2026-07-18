import { describe, expect, it } from "vitest";
import { z } from "zod";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { initNs, initNsResultSchema, renderInitNsHuman } from "../../src/init-ns.ts";
import {
	lifecycleStepSchema,
	renderLifecycleStepHuman,
} from "../../src/lifecycle-observability.ts";
import type { NsActivationContext } from "../../src/activation-context.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	CollectingLifecycleTraceSink,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/testing/index.ts";

const tracedFailureDataSchema = z.object({
	steps: z.array(lifecycleStepSchema).readonly(),
});

const freshConfig = `harnesses = ["codex","claude-code"]

[models.profiles.ultrafast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna"
thinking = "off"

[models.profiles.fast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna"
thinking = "medium"

[models.profiles.standard]
model = "vercel-ai-gateway/openai/gpt-5.6-terra"
thinking = "medium"

[models.profiles.deep]
model = "vercel-ai-gateway/openai/gpt-5.6-sol"
thinking = "low"

[models.profiles.ultradeep]
model = "vercel-ai-gateway/openai/gpt-5.6-sol"
thinking = "xhigh"
`;

function fixture(
	nsToml?: string,
	artifacts: InMemoryArtifactActivationGateway = new InMemoryArtifactActivationGateway(),
): {
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
			artifacts,
		},
		files,
	};
}

describe("initNs", () => {
	it("requires --harness on first activation and traces the usage failure", async () => {
		const { context } = fixture();
		const result = await initNs(context, { cwd: "/repo", harness: [] });
		expect(result).toMatchObject({
			type: "usageError",
			data: {
				argument: "harness",
				steps: [
					{ type: "phase", phase: "repository-preflight", status: "started" },
					expect.objectContaining({ type: "repository-resolved" }),
					{ type: "phase", phase: "repository-preflight", status: "completed" },
					{ type: "phase", phase: "configuration-preflight", status: "started" },
					{ type: "phase", phase: "configuration-preflight", status: "failed" },
					expect.objectContaining({
						type: "failure",
						phase: "configuration-preflight",
						code: "harness-required",
					}),
				],
			},
		});
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
				files: {
					"ns-toml": { change: "created" },
					"managed-extensions-ignore": { change: "created" },
					"agents-instructions": { change: "created" },
					"generated-instructions": { change: "created" },
				},
				consumerDirectories: [],
				artifacts: [],
			},
		});
		expect(files.fileContent("ns.toml")).toBe(freshConfig);
	});

	it("preserves an existing config byte-for-byte when its harness declaration is unchanged", async () => {
		const existing = `# customer comment
harnesses = ["pi"]

[customer]
value = "keep spacing"
`;
		const { context, files } = fixture(existing);
		const result = await initNs(context, { cwd: "/repo", harness: ["pi"] });
		expect(result).toMatchObject({
			type: "ok",
			data: { completed: { files: { "ns-toml": { change: "unchanged" } } } },
		});
		expect(files.fileContent("ns.toml")).toBe(existing);
	});

	it("records and streams one deterministic ordered lifecycle history", async () => {
		const { context } = fixture();
		const trace = new CollectingLifecycleTraceSink();
		const result = await initNs(
			{ ...context, lifecycleTrace: trace },
			{ cwd: "/repo", harness: ["pi"] },
		);
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.data.steps.map((step) => step.type)).toEqual([
			"phase",
			"repository-resolved",
			"phase",
			"phase",
			"harnesses-resolved",
			"phase",
			"phase",
			"activation-planned",
			"phase",
			"phase",
			"activation-file-completed",
			"activation-file-completed",
			"activation-file-completed",
			"activation-file-completed",
			"activation-file-completed",
			"phase",
			"phase",
		]);
		expect(trace.collectedLines()).toEqual(result.data.steps.map(renderLifecycleStepHuman));
	});

	it("ends configuration failures with the correct accumulated phase", async () => {
		const { context, files } = fixture('harnesses = ["unknown"]\n');
		const trace = new CollectingLifecycleTraceSink();
		const result = await initNs(
			{ ...context, lifecycleTrace: trace },
			{ cwd: "/repo", harness: [] },
		);
		expect(result).toMatchObject({
			type: "failure",
			data: {
				steps: [
					{ type: "phase", phase: "repository-preflight", status: "started" },
					expect.objectContaining({ type: "repository-resolved" }),
					{ type: "phase", phase: "repository-preflight", status: "completed" },
					{ type: "phase", phase: "configuration-preflight", status: "started" },
					{ type: "phase", phase: "configuration-preflight", status: "failed" },
					expect.objectContaining({ type: "failure", phase: "configuration-preflight" }),
				],
			},
		});
		if (result.type !== "failure") return;
		const data = tracedFailureDataSchema.parse(result.data);
		expect(trace.collectedLines()).toEqual(data.steps.map(renderLifecycleStepHuman));
		expect(files.operations()).toEqual([]);
	});

	it("traces apply failures after completed work and preserves recovery data", async () => {
		const { context } = fixture();
		const files = new InMemoryActivationFilesGateway({
			writeFailures: {
				".gitignore": { code: "write-denied", message: "Cannot write .gitignore." },
			},
		});
		const trace = new CollectingLifecycleTraceSink();
		const result = await initNs(
			{ ...context, files, lifecycleTrace: trace },
			{ cwd: "/repo", harness: ["pi"] },
		);

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-init-apply-failed",
			data: {
				phase: "managed-extensions-ignore",
				error: { code: "write-denied", message: "Cannot write .gitignore." },
				completed: { files: { "ns-toml": { change: "created" } } },
				steps: expect.arrayContaining([
					{ type: "phase", phase: "activation-apply", status: "failed" },
					expect.objectContaining({
						type: "failure",
						phase: "activation-apply",
						code: "write-denied",
					}),
				]),
			},
		});
		if (result.type !== "failure") return;
		const data = tracedFailureDataSchema.parse(result.data);
		expect(data.steps.at(-2)).toEqual({
			type: "phase",
			phase: "activation-apply",
			status: "failed",
		});
		expect(data.steps.at(-1)).toMatchObject({
			type: "failure",
			phase: "activation-apply",
			code: "write-denied",
		});
		expect(trace.collectedLines()).toEqual(data.steps.map(renderLifecycleStepHuman));
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
					files: {
						"ns-toml": { change: "unchanged" },
						"managed-extensions-ignore": { change: "unchanged" },
						"agents-instructions": { change: "unchanged" },
						"generated-instructions": { change: "unchanged" },
					},
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
				"  .gitignore           created",
				"  AGENTS.md            created",
				"  CLAUDE.md            created",
				"  .ns/instructions.md  created",
			].join("\n"),
		);
	});

	it("renders every non-empty report section byte-exactly", () => {
		const rendered = renderInitNsHuman({
			repoRoot: "/repo",
			trunkBranch: "main",
			harnesses: ["pi"],
			harnessSource: "ns-toml",
			completed: {
				files: { "ns-toml": { change: "unchanged" } },
				consumerDirectories: [{ path: ".ns/data", change: "created" }],
				artifacts: [
					{
						key: "pi:removed",
						action: "removed",
						artifactId: "@test/removed:demo",
						skillName: "demo",
						harness: "pi",
						targetArtifactPath: "/repo/.pi/skills/demo",
						manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
						writtenFiles: [],
						conflictingFiles: [],
						removedFiles: ["/repo/.pi/skills/demo/SKILL.md"],
						removalReason: "removed-source",
					},
				],
			},
			steps: [],
		});

		expect(rendered).toBe(
			[
				"Activated ns in /repo.",
				"Harnesses (ns-toml): pi.",
				"Files:",
				"  ns.toml  unchanged",
				"Consumer directories:",
				"  .ns/data  created",
				"Artifacts:",
				"  demo (pi)  removed [removed-source]",
			].join("\n"),
		);
	});

	it("renders sparse files in canonical order regardless of record insertion order", () => {
		const rendered = renderInitNsHuman({
			repoRoot: "/repo",
			trunkBranch: "main",
			harnesses: ["pi"],
			harnessSource: "explicit",
			completed: {
				files: {
					"generated-instructions": { change: "created" },
					"ns-toml": { change: "unchanged" },
					"agents-instructions": { change: "appended" },
				},
			},
			steps: [],
		});
		expect(rendered.indexOf("ns.toml")).toBeLessThan(rendered.indexOf("AGENTS.md"));
		expect(rendered.indexOf("AGENTS.md")).toBeLessThan(rendered.indexOf(".ns/instructions.md"));
		expect(rendered).not.toContain(".gitignore");
	});

	it("preserves removed artifact cleanup details in structured and human reports", async () => {
		const artifacts = new InMemoryArtifactActivationGateway({
			applyResult: {
				ok: true,
				completed: [
					{
						key: "pi:removed",
						action: "removed",
						artifactId: "@test/removed:demo",
						skillName: "demo",
						harness: "pi",
						targetArtifactPath: "/repo/.pi/skills/demo",
						manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
						writtenFiles: [],
						conflictingFiles: [],
						removedFiles: ["/repo/.pi/skills/demo/SKILL.md"],
						removalReason: "removed-source",
					},
					{
						key: "codex:deselected",
						action: "removed",
						artifactId: "@test/active:other",
						skillName: "other",
						harness: "codex",
						targetArtifactPath: "/repo/.agents/skills/other",
						manifestPath: "/repo/.agents/skills/.ns-harness-artifacts-manifest.json",
						writtenFiles: [],
						conflictingFiles: [],
						removedFiles: ["/repo/.agents/skills/other/SKILL.md"],
						removalReason: "deselected-harness",
					},
				],
			},
		});
		const { context } = fixture(undefined, artifacts);
		const result = await initNs(context, { cwd: "/repo", harness: ["pi"] });
		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		const structured = initNsResultSchema.parse(result.data);
		expect(structured.completed.artifacts).toMatchObject([
			{ action: "removed", removalReason: "removed-source", removedFiles: [expect.any(String)] },
			{
				action: "removed",
				removalReason: "deselected-harness",
				removedFiles: [expect.any(String)],
			},
		]);
		expect(renderInitNsHuman(structured)).toContain("Artifacts:");
		expect(renderInitNsHuman(structured)).toContain("demo (pi)");
		expect(renderInitNsHuman(structured)).toContain("removed");
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

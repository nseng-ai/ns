import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CURRENT_DISPATCH_STEP_NAMES } from "../../workflows/dispatch-inventory.ts";
import { triggerWorkflowIds } from "../../src/trigger/workflow-ids.ts";
import {
	type BuildOutputVerificationOperations,
	verifyDispatchBuildOutput,
} from "../../src/deployability/output-verifier.ts";

const roots = {
	outputRoot: "/output",
	apiSourceRoot: "/source/api",
	workflowsSourceRoot: "/source/workflows",
};

const workflowPrefix = "functions/.well-known/workflow/v1";
const outputFiles = [
	"functions/api/health.func/.vc-config.json",
	"functions/api/health.func/index.cjs",
	`${workflowPrefix}/flow.func/index.mjs`,
	`${workflowPrefix}/flow.func/.vc-config.json`,
	`${workflowPrefix}/webhook/[token].func/index.mjs`,
	`${workflowPrefix}/webhook/[token].func/.vc-config.json`,
	`${workflowPrefix}/manifest.json`,
];

function createOperations(
	failurePath?: string,
	failureKind: "any" | "digest" = "any",
): BuildOutputVerificationOperations {
	const manifest = {
		workflows: {
			"workflows/dispatch.ts": Object.fromEntries(
				Object.values(triggerWorkflowIds).map((workflowId) => [workflowId, { workflowId }]),
			),
		},
		steps: {
			"workflows/dispatch.ts": Object.fromEntries(
				CURRENT_DISPATCH_STEP_NAMES.map((name) => [name, { stepId: name }]),
			),
		},
	};
	return {
		async walkFiles(root) {
			if (failurePath === root) throw new Error("walk unavailable");
			return root === roots.outputRoot ? outputFiles : [".vc-config.json", "index.cjs"];
		},
		async listImmediateTypeScriptFiles(root) {
			return root === roots.apiSourceRoot ? ["health.ts"] : ["dispatch.ts"];
		},
		async listImmediateFunctionDirectories() {
			return ["health.func"];
		},
		async readText(path) {
			if (failureKind === "any" && failurePath === path) throw new Error("read unavailable");
			if (path.endsWith("api/health.func/.vc-config.json")) {
				return JSON.stringify({ handler: "index.cjs", runtime: "nodejs24.x" });
			}
			if (path.endsWith("flow.func/.vc-config.json")) {
				return JSON.stringify({
					experimentalTriggers: [{ type: "queue/v2beta", topic: "__wkf_workflow_*" }],
				});
			}
			if (path.endsWith("manifest.json")) return JSON.stringify(manifest);
			if (path.endsWith("workflows/dispatch.ts")) return '"use workflow";';
			if (path.endsWith("flow.func/index.mjs") || path.endsWith("webhook/[token].func/index.mjs")) {
				return 'import "@workflow/world-vercel";';
			}
			return "export const value = 1;";
		},
		async readBinary(path) {
			if (failurePath === path) throw new Error("digest unavailable");
			return new TextEncoder().encode(path);
		},
	};
}

async function verify(operations: BuildOutputVerificationOperations = createOperations()) {
	return await verifyDispatchBuildOutput(roots, operations);
}

describe("authoritative Build Output verifier", () => {
	it("returns a complete summary for hermetic API bundles", async () => {
		const result = await verify();
		expect(result).toMatchObject({
			ok: true,
			fileCount: outputFiles.length,
			apiFunctionCount: 1,
			javaScriptModuleCount: 1,
			workflowSourceCount: 1,
			requiredWorkflowArtifactCount: 5,
			routeTriggeredWorkflowIdCount: Object.values(triggerWorkflowIds).length,
		});
		if (result.ok) expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
	});

	it("contains and bounds an initial Build Output walk failure", async () => {
		const operations: BuildOutputVerificationOperations = {
			...createOperations(),
			async walkFiles() {
				throw new Error("x".repeat(1_000));
			},
		};
		const result = await verify(operations);
		expect(result).toMatchObject({ ok: false });
		if (result.ok === false) expect(result.problems[0]?.length).toBeLessThan(550);
	});

	it("contains a per-API-function walk failure", async () => {
		await expect(
			verify(createOperations(join(roots.outputRoot, "functions/api/health.func"))),
		).resolves.toMatchObject({ ok: false });
	});

	it("contains a CommonJS bundle read failure", async () => {
		await expect(
			verify(createOperations(join(roots.outputRoot, "functions/api/health.func", "index.cjs"))),
		).resolves.toMatchObject({ ok: false });
	});

	it.each([
		join(roots.outputRoot, `${workflowPrefix}/flow.func/index.mjs`),
		join(roots.workflowsSourceRoot, "dispatch.ts"),
		join(roots.outputRoot, `${workflowPrefix}/flow.func/.vc-config.json`),
	])("contains Workflow read failure for %s", async (path) => {
		await expect(verify(createOperations(path))).resolves.toMatchObject({ ok: false });
	});

	it("contains a final digest read failure after semantic verification", async () => {
		await expect(
			verify(createOperations(join(roots.outputRoot, outputFiles[0] ?? ""), "digest")),
		).resolves.toMatchObject({
			ok: false,
			problems: [expect.stringContaining("digest input")],
		});
	});
});

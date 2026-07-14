import { describe, expect, it } from "vitest";

import {
	findMissingTriggerWorkflowManifestIds,
	findMissingWorkflowFunctionArtifacts,
	findMissingWorkflowManifestIds,
	findWorkflowQueueTriggerProblems,
	findWorkflowSourcesMissingFromManifest,
	mergeBuildOutputConfig,
	REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS,
} from "../../src/deployability/gate.ts";
import { triggerWorkflowIds } from "../../src/trigger/workflow-ids.ts";

const flowVcConfig = {
	runtime: "nodejs22.x",
	handler: "index.mjs",
	experimentalTriggers: [
		{
			type: "queue/v2beta",
			topic: "__wkf_workflow_*",
			consumer: "default",
		},
	],
};

describe("findMissingWorkflowFunctionArtifacts", () => {
	it("accepts the v5 unified flow and webhook function artifacts", () => {
		const emitted = new Set([
			".well-known/workflow/v1/flow.func/index.mjs",
			".well-known/workflow/v1/flow.func/.vc-config.json",
			".well-known/workflow/v1/webhook/[token].func/index.mjs",
			".well-known/workflow/v1/webhook/[token].func/.vc-config.json",
			".well-known/workflow/v1/manifest.json",
		]);

		expect(findMissingWorkflowFunctionArtifacts(emitted)).toEqual([]);
	});

	it("accepts an output containing every required workflow function artifact", () => {
		const emitted = new Set([...REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS, "api/mint.func/index.js"]);

		expect(findMissingWorkflowFunctionArtifacts(emitted)).toEqual([]);
	});

	it("reports every artifact the workflow build failed to emit", () => {
		const emitted = new Set(["api/mint.func/index.js"]);

		expect(findMissingWorkflowFunctionArtifacts(emitted)).toEqual(
			REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS,
		);
	});

	it("reports a missing unified flow bundle while accepting the rest", () => {
		const emitted = new Set(
			REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS.filter(
				(path) => path !== ".well-known/workflow/v1/flow.func/index.mjs",
			),
		);

		expect(findMissingWorkflowFunctionArtifacts(emitted)).toEqual([
			".well-known/workflow/v1/flow.func/index.mjs",
		]);
	});
});

describe("findWorkflowQueueTriggerProblems", () => {
	it("accepts the v5 unified flow function's default Queues wiring", () => {
		expect(findWorkflowQueueTriggerProblems(flowVcConfig)).toEqual([]);
	});

	it("reports a flow function without any queue trigger", () => {
		const problems = findWorkflowQueueTriggerProblems({
			runtime: "nodejs22.x",
			handler: "index.mjs",
		});

		expect(problems).toEqual([
			"flow function .vc-config.json is missing the queue/v2beta trigger on topic __wkf_workflow_*.",
		]);
	});

	it("reports a flow function wired to the retired v4 step topic", () => {
		const problems = findWorkflowQueueTriggerProblems({
			experimentalTriggers: [{ type: "queue/v2beta", topic: "__wkf_step_*" }],
		});

		expect(problems).toEqual([
			"flow function .vc-config.json is missing the queue/v2beta trigger on topic __wkf_workflow_*.",
		]);
	});

	it("reports an unparseable vc-config", () => {
		expect(findWorkflowQueueTriggerProblems("not an object")).toEqual([
			"flow function .vc-config.json is not an object with optional triggers.",
		]);
	});
});

describe("findWorkflowSourcesMissingFromManifest", () => {
	const probeSource = '"use workflow";\n\nexport async function probe(): Promise<void> {}\n';

	it("accepts a manifest that covers every use-workflow source", () => {
		const sources = new Map([["workflows/hello.ts", probeSource]]);
		const manifest = {
			version: "1.0.0",
			workflows: {
				"workflows/hello.ts": { probe: { workflowId: "workflow//./workflows/hello//probe" } },
			},
		};

		expect(findWorkflowSourcesMissingFromManifest(sources, manifest)).toEqual([]);
	});

	it("reports a use-workflow source the builder silently skipped", () => {
		const sources = new Map([["workflows/hello.ts", probeSource]]);
		const manifest = { version: "1.0.0", workflows: {} };

		expect(findWorkflowSourcesMissingFromManifest(sources, manifest)).toEqual([
			"workflows/hello.ts",
		]);
	});

	it("reports a source whose manifest entry is empty", () => {
		const sources = new Map([["workflows/hello.ts", probeSource]]);
		const manifest = { version: "1.0.0", workflows: { "workflows/hello.ts": {} } };

		expect(findWorkflowSourcesMissingFromManifest(sources, manifest)).toEqual([
			"workflows/hello.ts",
		]);
	});

	it("ignores sources without a use-workflow directive", () => {
		const sources = new Map([
			[
				"workflows/steps-only.ts",
				'export async function helper(): Promise<void> {\n\t"use step";\n}\n',
			],
		]);
		const manifest = { version: "1.0.0", workflows: {} };

		expect(findWorkflowSourcesMissingFromManifest(sources, manifest)).toEqual([]);
	});

	it("treats a malformed manifest as missing coverage for every use-workflow source", () => {
		const sources = new Map([["workflows/hello.ts", probeSource]]);

		expect(findWorkflowSourcesMissingFromManifest(sources, { workflows: "bogus" })).toEqual([
			"workflows/hello.ts",
		]);
	});
});

describe("findMissingWorkflowManifestIds", () => {
	const manifest = {
		version: "1.0.0",
		workflows: {
			"workflows/hello.ts": {
				helloWorkflow: { workflowId: "workflow//./workflows/hello//helloWorkflow" },
			},
		},
	};

	it("accepts a manifest containing every route-triggered workflow id", () => {
		expect(
			findMissingWorkflowManifestIds(manifest, ["workflow//./workflows/hello//helloWorkflow"]),
		).toEqual([]);
	});

	it("reports a required id the manifest does not contain", () => {
		expect(
			findMissingWorkflowManifestIds(manifest, ["workflow//./workflows/other//otherWorkflow"]),
		).toEqual(["workflow//./workflows/other//otherWorkflow"]);
	});

	it("treats a malformed manifest as missing every required id", () => {
		expect(
			findMissingWorkflowManifestIds({ workflows: "bogus" }, [
				"workflow//./workflows/hello//helloWorkflow",
			]),
		).toEqual(["workflow//./workflows/hello//helloWorkflow"]);
	});

	it("detects one missing emitted id from the trigger gateway's shared record", () => {
		const emittedIds = Object.values(triggerWorkflowIds).filter(
			(workflowId) => workflowId !== triggerWorkflowIds.hello,
		);
		const sharedRecordManifest = {
			workflows: {
				"workflows/synthetic.ts": Object.fromEntries(
					emittedIds.map((workflowId, index) => [`workflow${index}`, { workflowId }]),
				),
			},
		};

		expect(findMissingTriggerWorkflowManifestIds(sharedRecordManifest)).toEqual([
			triggerWorkflowIds.hello,
		]);
	});
});

describe("mergeBuildOutputConfig", () => {
	const vercelConfig = {
		version: 3,
		routes: [{ handle: "filesystem" }, { src: "^/api(/.*)?$", status: 404 }],
		crons: [],
	};
	const workflowConfig = {
		version: 3,
		routes: [
			{
				src: "^\\/\\.well-known\\/workflow\\/v1\\/webhook\\/([^\\/]+)$",
				dest: "/.well-known/workflow/v1/webhook/[token]",
			},
		],
	};

	it("prepends workflow routes to the vercel-build routes and keeps other keys", () => {
		expect(mergeBuildOutputConfig(vercelConfig, workflowConfig)).toEqual({
			version: 3,
			routes: [...workflowConfig.routes, ...vercelConfig.routes],
			crons: [],
		});
	});

	it("rejects a workflow config with keys the merge does not understand", () => {
		expect(() =>
			mergeBuildOutputConfig(vercelConfig, { ...workflowConfig, images: {} }),
		).toThrowError(/keys beyond version\/routes/u);
	});

	it("rejects disagreeing Build Output versions", () => {
		expect(() => mergeBuildOutputConfig(vercelConfig, { version: 4, routes: [] })).toThrowError(
			/versions disagree/u,
		);
	});

	it("rejects a vercel config without a version", () => {
		expect(() => mergeBuildOutputConfig({ routes: [] }, workflowConfig)).toThrowError(
			/without a numeric version/u,
		);
	});
});

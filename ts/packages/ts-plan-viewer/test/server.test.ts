import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SavedTsPlanSummary } from "../src/plan-store.ts";
import { createTsPlanViewerRequestHandler } from "../src/server.ts";

const tempRoots: string[] = [];

interface JsonSuccess<T> {
	success: true;
	data: T;
}

interface JsonFailure {
	success: false;
	error: {
		code: string;
		message: string;
	};
}

async function createPlanStoreWithSamplePlan(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ts-plan-viewer-server-"));
	tempRoots.push(root);
	const directory = join(root, "gh--owner--repo", "main");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "sample.plan.ts"),
		`import { definePlan } from "@asdl/ts-plans";

export default definePlan({
	title: "Viewer sample",
	summary: "Sample summary",
	goal: "Render a saved plan",
	context: "Server test context",
	phases: [{ title: "Inspect", tasks: ["Open outline", "Open graph"] }],
});
`,
	);
	return root;
}

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

afterEach(async () => {
	await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ts plan viewer request handler", () => {
	test("serves health, plan listing, source, and previews", async () => {
		const root = await createPlanStoreWithSamplePlan();
		const handler = createTsPlanViewerRequestHandler({ planStoreRoot: root, cwd: process.cwd() });

		const healthResponse = await handler(new Request("http://viewer.test/api/health"));
		expect(healthResponse.status).toBe(200);
		const health = await readJson<JsonSuccess<{ ok: boolean; planStoreRoot: string; cwd: string; trustNotice: string }>>(healthResponse);
		expect(health.success).toBe(true);
		expect(health.data.ok).toBe(true);
		expect(health.data.planStoreRoot).toBe(root);
		expect(health.data.trustNotice).toContain("Trust boundary");

		const listResponse = await handler(new Request("http://viewer.test/api/plans"));
		expect(listResponse.status).toBe(200);
		const list = await readJson<JsonSuccess<{ plans: SavedTsPlanSummary[] }>>(listResponse);
		expect(list.data.plans).toHaveLength(1);
		const plan = list.data.plans[0];
		expect(plan?.slug).toBe("sample");
		expect(plan?.filePath).toContain("sample.plan.ts");
		if (plan === undefined) return;

		const sourceResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/source"));
		expect(sourceResponse.status).toBe(200);
		const source = await readJson<JsonSuccess<{ source: string; filePath: string }>>(sourceResponse);
		expect(source.data.source).toContain("Viewer sample");

		const structuredResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/preview?format=structured"));
		expect(structuredResponse.status).toBe(200);
		const structured = await readJson<JsonSuccess<{ model: { title?: string; goal: string; phases: readonly { title: string; tasks: readonly string[] }[] }; trustNotice: string }>>(structuredResponse);
		expect(structured.data.model.title).toBe("Viewer sample");
		expect(structured.data.model.goal).toBe("Render a saved plan");
		expect(structured.data.model.phases[0]?.tasks).toEqual(["Open outline", "Open graph"]);
		expect(structured.data.trustNotice).toContain("Trust boundary");

		const textResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/preview?format=text"));
		expect(textResponse.status).toBe(200);
		const text = await readJson<JsonSuccess<{ preview: { format: string; content: string; trustNotice: string } }>>(textResponse);
		expect(text.data.preview.format).toBe("text");
		expect(text.data.preview.content).toContain("Goal:\nRender a saved plan");

		const mermaidResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/preview?format=mermaid"));
		expect(mermaidResponse.status).toBe(200);
		const mermaid = await readJson<JsonSuccess<{ preview: { format: string; content: string } }>>(mermaidResponse);
		expect(mermaid.data.preview.format).toBe("mermaid");
		expect(mermaid.data.preview.content.startsWith("flowchart TD")).toBe(true);
	});

	test("returns structured failures for invalid ids, formats, and missing plans", async () => {
		const root = await createPlanStoreWithSamplePlan();
		const handler = createTsPlanViewerRequestHandler({ planStoreRoot: root, cwd: process.cwd() });

		const invalidIdResponse = await handler(new Request("http://viewer.test/api/plans/not-a-path/source"));
		expect(invalidIdResponse.status).toBe(400);
		const invalidId = await readJson<JsonFailure>(invalidIdResponse);
		expect(invalidId.success).toBe(false);
		expect(invalidId.error.code).toBe("invalid-id");

		const listResponse = await handler(new Request("http://viewer.test/api/plans"));
		const list = await readJson<JsonSuccess<{ plans: SavedTsPlanSummary[] }>>(listResponse);
		const plan = list.data.plans[0];
		if (plan === undefined) return;

		const badFormatResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/preview?format=html"));
		expect(badFormatResponse.status).toBe(400);
		const badFormat = await readJson<JsonFailure>(badFormatResponse);
		expect(badFormat.error.code).toBe("unsupported-format");

		await rm(join(root, "gh--owner--repo", "main", "sample.plan.ts"));
		const missingResponse = await handler(new Request("http://viewer.test/api/plans/" + encodeURIComponent(plan.id) + "/source"));
		expect(missingResponse.status).toBe(404);
		const missing = await readJson<JsonFailure>(missingResponse);
		expect(missing.error.code).toBe("not-found");
	});

	test("serves the browser shell for non-api paths", async () => {
		const handler = createTsPlanViewerRequestHandler({ planStoreRoot: await createPlanStoreWithSamplePlan(), cwd: process.cwd() });
		const response = await handler(new Request("http://viewer.test/"));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type") ?? "").toContain("text/html");
		expect(await response.text()).toContain("TypeScript Plan Viewer");
	});
});

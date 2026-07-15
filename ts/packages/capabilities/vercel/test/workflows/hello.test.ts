import { describe, expect, it } from "vitest";

import { helloWorkflowId } from "../../workflows/hello-id.ts";
import { helloWorkflow } from "../../workflows/hello.ts";
import { workflowManifestId } from "../../workflows/workflow-manifest-id.ts";

describe("helloWorkflow", () => {
	it("greets the dispatched name (directives are inert outside the workflow runtime)", async () => {
		expect(await helloWorkflow("world")).toBe("hello, world");
	});

	it("derives its metadata id from the module path and export name", () => {
		expect(workflowManifestId("workflows/hello.ts", helloWorkflow.name)).toBe(helloWorkflowId);
	});
});

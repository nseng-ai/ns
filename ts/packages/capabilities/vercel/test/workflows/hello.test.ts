import { describe, expect, it } from "vitest";

import { helloWorkflow, helloWorkflowId } from "../../workflows/hello.ts";

describe("helloWorkflow", () => {
	it("greets the dispatched name (directives are inert outside the workflow runtime)", async () => {
		expect(await helloWorkflow("world")).toBe("hello, world");
	});

	it("derives its metadata id from the module path and export name", () => {
		expect(helloWorkflowId).toBe(`workflow//./workflows/hello//${helloWorkflow.name}`);
	});
});

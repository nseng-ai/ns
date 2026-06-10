import { expect, test } from "vitest";

import { ClinkrGroup } from "@asdl/clinkr";
import { createCaptureIo, type CapturedRun } from "@asdl/clinkr/testing";

test("subpath exports resolve through the package name", () => {
	const capture = createCaptureIo();
	capture.io.stdout("x");
	expect(capture.stdout()).toBe("x");
	const run: CapturedRun | null = null;
	expect(run).toBeNull();
	expect(typeof ClinkrGroup).toBe("function");
});

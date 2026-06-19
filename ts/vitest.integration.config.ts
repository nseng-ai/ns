import { defineConfig } from "vitest/config";

import { INTEGRATION_TEST_GLOB, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [INTEGRATION_TEST_GLOB],
	},
});

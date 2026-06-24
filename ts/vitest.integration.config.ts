import { defineConfig } from "vitest/config";

import { INTEGRATION_TEST_GLOBS, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...INTEGRATION_TEST_GLOBS],
	},
});

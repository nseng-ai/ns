import { configDefaults, defineConfig } from "vitest/config";

import { INTEGRATION_TEST_GLOB, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: ["packages/*/test/**/*.test.ts"],
		exclude: [...configDefaults.exclude, INTEGRATION_TEST_GLOB],
	},
});

import { configDefaults, defineConfig } from "vitest/config";

import {
	INTEGRATION_TEST_GLOBS,
	sharedTestConfig,
	TYPESCRIPT_STYLE_GUARD_TEST_GLOBS,
} from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: ["packages/*/test/**/*.test.ts", "packages/*/*/test/**/*.test.ts"],
		exclude: [
			...configDefaults.exclude,
			...INTEGRATION_TEST_GLOBS,
			...TYPESCRIPT_STYLE_GUARD_TEST_GLOBS,
		],
	},
});

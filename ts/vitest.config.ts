import { configDefaults, defineConfig } from "vitest/config";

import { sharedTestConfig, SPECIALIZED_TEST_CATEGORIES, testGlobsFor } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...testGlobsFor()],
		exclude: [
			...configDefaults.exclude,
			...SPECIALIZED_TEST_CATEGORIES.flatMap(({ globs }) => globs),
		],
	},
});

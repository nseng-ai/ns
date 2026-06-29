import { defineConfig } from "vitest/config";

import { sharedTestConfig, TYPESCRIPT_STYLE_GUARD_TEST_GLOBS } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...TYPESCRIPT_STYLE_GUARD_TEST_GLOBS],
	},
});

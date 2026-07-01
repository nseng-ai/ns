import { defineConfig } from "vitest/config";

import { globsForTestCategory, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...globsForTestCategory("typescript-style-guard")],
	},
});

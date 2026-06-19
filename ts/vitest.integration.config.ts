import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: ["packages/*/test/integration/**/*.test.ts"],
	},
});

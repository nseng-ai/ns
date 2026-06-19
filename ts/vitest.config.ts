import { configDefaults, defineConfig } from "vitest/config";

import { sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: ["packages/*/test/**/*.test.ts"],
		exclude: [...configDefaults.exclude, "packages/*/test/integration/**/*.test.ts"],
	},
});

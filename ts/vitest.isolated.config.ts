import { defineConfig } from "vitest/config";

import { globsForTestCategory, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		isolate: true,
		include: [...globsForTestCategory("isolated")],
	},
});

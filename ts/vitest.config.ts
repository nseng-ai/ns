import { configDefaults, defineConfig } from "vitest/config";

import { allSpecializedTestGlobs, sharedTestConfig, testGlobsFor } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...testGlobsFor()],
		exclude: [...configDefaults.exclude, ...allSpecializedTestGlobs()],
	},
});

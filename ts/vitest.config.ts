import { configDefaults, defineConfig } from "vitest/config";

import { allSpecializedTestGlobs, defaultTestGlobs, sharedTestConfig } from "./vitest.shared.ts";

export default defineConfig({
	test: {
		...sharedTestConfig,
		include: [...defaultTestGlobs()],
		exclude: [...configDefaults.exclude, ...allSpecializedTestGlobs()],
	},
});

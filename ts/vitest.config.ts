import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		fileParallelism: true,
		maxWorkers: 4,
		globals: false,
		include: ["packages/*/test/**/*.test.ts"],
	},
});

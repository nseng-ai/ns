import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		fileParallelism: true,
		isolate: false,
		maxWorkers: 2,
		globals: false,
		include: ["packages/*/test/integration/**/*.test.ts"],
	},
});

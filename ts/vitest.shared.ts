export const INTEGRATION_TEST_GLOB = "packages/*/test/integration/**/*.test.ts";

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;

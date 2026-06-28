export const INTEGRATION_TEST_GLOBS = [
	"packages/*/test/integration/**/*.test.ts",
	"packages/extensions/*/test/integration/**/*.test.ts",
	"packages/hosts/*/test/integration/**/*.test.ts",
] as const;

export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;

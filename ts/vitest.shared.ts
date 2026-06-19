export const sharedTestConfig = {
	environment: "node" as const,
	fileParallelism: true,
	isolate: false,
	maxWorkers: 2,
	globals: false,
} as const;

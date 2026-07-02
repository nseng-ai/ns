export function buildReadGraphiteBranchMetadataArgs(dbPath: string): string[] {
	return ["flow", "exec", "read-graphite-branch-metadata", "--db-path", dbPath];
}

export function isReadGraphiteBranchMetadataArgs(args: readonly string[]): boolean {
	return args[0] === "flow" && args[1] === "exec" && args[2] === "read-graphite-branch-metadata";
}

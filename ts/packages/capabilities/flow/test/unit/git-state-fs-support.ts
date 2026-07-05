import type { GitWorktreeStateFs } from "@nseng-ai/capability-kit/git";

export function fakeGitStateFs(paths: readonly string[]): GitWorktreeStateFs {
	const existing = new Set(paths);
	return {
		pathKind(path) {
			return existing.has(path)
				? path.includes(".") && !path.endsWith(".git")
					? "file"
					: "directory"
				: "missing";
		},
		readTextFile(path) {
			if (path.endsWith("/.git/HEAD")) return "ref: refs/heads/main\n";
			return "";
		},
	};
}

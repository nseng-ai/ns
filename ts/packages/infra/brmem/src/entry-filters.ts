import { optionalEntries } from "@nseng-ai/core/primitives";

export function keyBranchFilter(options: { key?: string; branch?: string }): {
	key?: string;
	branch?: string;
} {
	return optionalEntries({ key: options.key, branch: options.branch });
}

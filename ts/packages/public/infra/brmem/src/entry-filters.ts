import { optionalEntries } from "@nseng-ai/foundation/primitives";

export function keyBranchFilter(options: { key?: string; branch?: string }): {
	key?: string;
	branch?: string;
} {
	return optionalEntries({ key: options.key, branch: options.branch });
}

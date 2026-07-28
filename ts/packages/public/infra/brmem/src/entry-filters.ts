import { optionalEntries } from "@nseng-ai/ns-foundation/primitives";

export function keyBranchFilter(options: { key?: string; branch?: string }): {
	key?: string;
	branch?: string;
} {
	return optionalEntries({ key: options.key, branch: options.branch });
}

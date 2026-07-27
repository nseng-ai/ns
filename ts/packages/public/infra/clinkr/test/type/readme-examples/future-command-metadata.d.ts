import "@nseng-ai/clinkr/app";

declare module "@nseng-ai/clinkr/app" {
	/** Future directory-tree metadata documented by the Objective README draft. */
	interface ClinkrCommandMetadata {
		readonly summary?: string;
		readonly hidden?: boolean;
		readonly helpGroup?: string;
	}
}

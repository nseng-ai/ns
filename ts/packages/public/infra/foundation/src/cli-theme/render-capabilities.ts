// Theme-owned contract for what a renderer may emit into its output sink.
//
// This is the theme layer's own concept, not a copy of the legacy Clinkr type: renderers need to
// know whether they may style output regardless of what happens to the quarantined
// `@nseng-ai/clinkr/legacy` entrypoint. It deliberately structurally accepts the legacy
// `RenderCapabilities` shape so `/legacy`-typed values keep flowing into theme renderers during
// the migration, while theme source stays on the neutral @nseng-ai/clinkr root substrate
// (enforced by test/cli-theme/package-boundary.test.ts).

import { resolveSettledNonInteractiveCaps, type Caps } from "@nseng-ai/clinkr";

/** Capabilities of the output sink, passed to theme renderers. */
export interface ThemeRenderCapabilities {
	/** Whether the renderer may emit ANSI styling. */
	readonly canEmitAnsi: boolean;
	/** Full terminal capabilities for the resolved output sink. */
	readonly caps?: Caps;
}

export function resolveThemeCaps(renderCapabilities: ThemeRenderCapabilities): Caps {
	return renderCapabilities.caps ?? resolveSettledNonInteractiveCaps();
}

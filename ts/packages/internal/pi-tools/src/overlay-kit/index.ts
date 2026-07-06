export {
	FALLBACK_TERMINAL_ROWS,
	MIN_RENDER_WIDTH_COLS,
	OVERLAY_MARGIN_ROWS,
	OVERLAY_MAX_HEIGHT_RATIO,
	overlayChromeRows,
	overlayHostOptions,
	overlayInnerWidth,
	overlayModalRows,
	overlayRenderLayout,
	overlayTerminalRows,
	renderOverlayFrame,
} from "./frame.ts";
export type { OverlayFrameOptions, OverlayHostOptions } from "./frame.ts";
export {
	sliceWrappedDetailLinesForViewport,
	wrapDetailLines,
	wrapDetailLinesForViewport,
} from "./viewport.ts";
export type { WrappedDetailViewport, WrappedDetailViewportOptions } from "./viewport.ts";

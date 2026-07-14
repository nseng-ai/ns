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
} from "./overlay/frame.ts";
export type { OverlayFrameOptions, OverlayHostOptions } from "./overlay/frame.ts";
export {
	sliceWrappedDetailLinesForViewport,
	wrapDetailLines,
	wrapDetailLinesForViewport,
} from "./overlay/viewport.ts";
export type { WrappedDetailViewport, WrappedDetailViewportOptions } from "./overlay/viewport.ts";

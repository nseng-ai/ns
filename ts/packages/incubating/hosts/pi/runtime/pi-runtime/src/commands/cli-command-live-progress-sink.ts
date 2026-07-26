import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";

import {
	isStaleExtensionContextError,
	withSafePiUi,
	withSafePiUiValue,
} from "../kit/shared/safe-ui.ts";
import type { SetWidgetFunction, WidgetComponentFactory } from "../runtime/tool-types.ts";
import {
	renderLiveProgressWidget,
	type LiveProgressDisplaySnapshot,
} from "./cli-command-live-progress-widget.ts";

const LIVE_PROGRESS_STATUS_ID = "ns-cli-command";
const LIVE_PROGRESS_WIDGET_ID = "ns-cli-command-output";
const LIVE_PROGRESS_STATUS_INTERVAL_MS = 1_000;
const LIVE_PROGRESS_WIDGET_INTERVAL_MS = 120;

export type LiveProgressTarget = "none" | "status" | "widget";

export interface LiveCommandProgressContext {
	readonly hasUI?: boolean;
	readonly ui: {
		setStatus?(key: string, value: string | undefined): void;
		setWidget?: SetWidgetFunction;
	};
}

export interface LiveProgressSink {
	changed(): void;
	close(): void;
}

interface CreateLiveProgressSinkOptions {
	readonly target: LiveProgressTarget;
	readonly ctx: LiveCommandProgressContext;
	readonly timers: TimerScheduler;
	readonly getStatusValue: () => string;
	readonly getDisplaySnapshot: (spinnerTick: number) => LiveProgressDisplaySnapshot;
	readonly onStaleContext: () => void;
	readonly onUnexpectedRenderRequestError: (error: unknown) => void;
}

export function resolveLiveProgressTarget(ctx: LiveCommandProgressContext): LiveProgressTarget {
	if (!ctx.hasUI) return "none";

	const result = withSafePiUiValue(() => {
		if (ctx.ui.setWidget !== undefined) return "widget";
		if (ctx.ui.setStatus !== undefined) return "status";
		return "none";
	});
	if (result.type === "stale-context") return "none";
	return result.value;
}

export function createLiveProgressSink(options: CreateLiveProgressSinkOptions): LiveProgressSink {
	switch (options.target) {
		case "none":
			return new NoUiProgressSink();
		case "status":
			return new StatusProgressSink(options);
		case "widget":
			return new WidgetProgressSink(options);
	}
}

class NoUiProgressSink implements LiveProgressSink {
	changed(): void {}
	close(): void {}
}

class StatusProgressSink implements LiveProgressSink {
	private readonly ctx: LiveCommandProgressContext;
	private readonly getStatusValue: () => string;
	private readonly onStaleContext: () => void;
	private lastValue: string | undefined;
	private timer: ScheduledTimer | undefined;
	private isClosed = false;

	constructor(options: CreateLiveProgressSinkOptions) {
		this.ctx = options.ctx;
		this.getStatusValue = options.getStatusValue;
		this.onStaleContext = options.onStaleContext;
		this.changed();
		if (this.isClosed) return;
		this.timer = options.timers.setInterval(() => {
			this.changed();
		}, LIVE_PROGRESS_STATUS_INTERVAL_MS);
	}

	changed(): void {
		if (this.isClosed) return;
		const value = this.getStatusValue();
		if (value === this.lastValue) return;

		const result = withSafePiUi(() => {
			this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, value);
		});
		if (result.type === "stale-context") {
			this.detachForStaleContext();
			return;
		}
		this.lastValue = value;
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.clearTimer();
		const result = withSafePiUi(() => {
			this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, undefined);
		});
		if (result.type === "stale-context") this.onStaleContext();
	}

	private detachForStaleContext(): void {
		this.isClosed = true;
		this.clearTimer();
		this.onStaleContext();
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		this.timer.cancel();
		this.timer = undefined;
	}
}

class WidgetProgressSink implements LiveProgressSink {
	private readonly ctx: LiveCommandProgressContext;
	private readonly timers: TimerScheduler;
	private readonly getDisplaySnapshot: (spinnerTick: number) => LiveProgressDisplaySnapshot;
	private readonly onStaleContext: () => void;
	private readonly onUnexpectedRenderRequestError: (error: unknown) => void;
	private activeRenderRequest: (() => void) | undefined;
	private timer: ScheduledTimer | undefined;
	private spinnerTick = 0;
	private hasTracedUnexpectedRequestError = false;
	private isClosed = false;

	constructor(options: CreateLiveProgressSinkOptions) {
		this.ctx = options.ctx;
		this.timers = options.timers;
		this.getDisplaySnapshot = options.getDisplaySnapshot;
		this.onStaleContext = options.onStaleContext;
		this.onUnexpectedRenderRequestError = options.onUnexpectedRenderRequestError;
		this.install();
	}

	changed(): void {
		this.requestRender();
	}

	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.activeRenderRequest = undefined;
		this.clearTimer();
		const result = withSafePiUi(() => {
			this.ctx.ui.setStatus?.(LIVE_PROGRESS_STATUS_ID, undefined);
			this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, undefined);
		});
		if (result.type === "stale-context") this.onStaleContext();
	}

	private install(): void {
		const factory: WidgetComponentFactory = (tui, theme) => {
			const requestRender = (): void => {
				tui.requestRender();
			};
			this.activateRenderRequest(requestRender);
			return {
				render: (width: number): string[] => {
					if (this.isClosed || width <= 0) return [];
					return renderLiveProgressWidget(this.getDisplaySnapshot(this.spinnerTick), theme, width);
				},
				invalidate(): void {},
				dispose: (): void => {
					this.detachRenderRequest(requestRender);
				},
			};
		};
		const result = withSafePiUi(() => {
			this.ctx.ui.setWidget?.(LIVE_PROGRESS_WIDGET_ID, factory, {
				placement: "aboveEditor",
			});
		});
		if (result.type === "stale-context") this.detachForStaleContext();
	}

	private activateRenderRequest(requestRender: () => void): void {
		if (this.isClosed) return;
		this.clearTimer();
		this.activeRenderRequest = requestRender;
		this.hasTracedUnexpectedRequestError = false;
		this.timer = this.timers.setInterval(() => {
			this.spinnerTick += 1;
			this.requestRender();
		}, LIVE_PROGRESS_WIDGET_INTERVAL_MS);
	}

	private requestRender(): void {
		if (this.isClosed) return;
		const requestRender = this.activeRenderRequest;
		if (requestRender === undefined) return;
		try {
			requestRender();
		} catch (error) {
			if (isStaleExtensionContextError(error)) {
				this.detachRenderRequest(requestRender);
				this.onStaleContext();
				return;
			}
			if (this.hasTracedUnexpectedRequestError) return;
			this.hasTracedUnexpectedRequestError = true;
			try {
				this.onUnexpectedRenderRequestError(error);
			} catch {
				// Diagnostics are best-effort and must not turn a render failure into a command failure.
			}
		}
	}

	private detachRenderRequest(requestRender: () => void): void {
		if (this.activeRenderRequest !== requestRender) return;
		this.activeRenderRequest = undefined;
		this.clearTimer();
	}

	private detachForStaleContext(): void {
		this.activeRenderRequest = undefined;
		this.clearTimer();
		this.onStaleContext();
	}

	private clearTimer(): void {
		if (this.timer === undefined) return;
		this.timer.cancel();
		this.timer = undefined;
	}
}

import type { NsExtensionApi, NsProgressPhaseInfo, NsProgressPhaseEvent } from "@nseng-ai/sdk";

export interface TextPhaseProgress {
	phase(phaseKey: string, label: string): void;
	finish(isFailed?: boolean): void;
}

/** Bridges bounded textual workflows to typed host progress with a useful append-only fallback. */
export function createTextPhaseProgress(
	ctx: NsExtensionApi,
	options: { title: string; phases: readonly NsProgressPhaseInfo[] },
): TextPhaseProgress {
	let activePhaseKey: string | undefined;
	let declared = false;

	function emit(event: NsProgressPhaseEvent): void {
		ctx.progress.phase(event);
	}

	function phase(phaseKey: string, label: string): void {
		if (!ctx.progress.isLive) {
			ctx.commandIo.phase(label);
			return;
		}
		if (!declared) {
			emit({ type: "phases-declared", title: options.title, phases: options.phases });
			declared = true;
		}
		if (activePhaseKey === phaseKey) {
			emit({ type: "phase-progress", phaseKey, label });
			return;
		}
		if (activePhaseKey !== undefined) emit({ type: "phase-done", phaseKey: activePhaseKey });
		activePhaseKey = phaseKey;
		emit({ type: "phase-started", phaseKey, label });
	}

	function finish(isFailed = false): void {
		if (!ctx.progress.isLive || activePhaseKey === undefined) return;
		emit(
			isFailed
				? { type: "phase-failed", phaseKey: activePhaseKey, detail: "command failed" }
				: { type: "phase-done", phaseKey: activePhaseKey },
		);
		activePhaseKey = undefined;
	}

	return { phase, finish };
}

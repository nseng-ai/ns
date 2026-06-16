import { formatElapsedMs } from "@asdl/core/time-format";

export interface IdleWaitStatusUi {
	setStatus(key: string, value: string | undefined): void;
}

// Render a ticking "waiting for Pi to finish responding (Ns)" status immediately and then
// once per second, so a long idle wait visibly stays alive. Returns a cleanup closure that
// stops the ticker; call it before the caller drives its own status.
export function startIdleWaitStatus(ui: IdleWaitStatusUi, key: string): () => void {
	const startedAt = Date.now();
	const render = () => ui.setStatus(key, `waiting for Pi to finish responding (${formatElapsedMs(Date.now() - startedAt)})`);
	render();
	const timer = setInterval(render, 1_000);
	return () => clearInterval(timer);
}

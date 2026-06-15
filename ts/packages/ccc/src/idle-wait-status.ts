export interface IdleWaitStatusUi {
	setStatus(key: string, value: string | undefined): void;
}

// Local copy of pi-extensions' formatElapsedMs. pi-extensions depends on @asdl/ccc,
// so importing it back here would invert the dependency; keep features decoupled.
function formatElapsed(elapsedMs: number): string {
	const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

// Render a ticking "waiting for Pi to finish responding (Ns)" status immediately and then
// once per second, so a long idle wait visibly stays alive. Returns a cleanup closure that
// stops the ticker; call it before the caller drives its own status.
export function startIdleWaitStatus(ui: IdleWaitStatusUi, key: string): () => void {
	const startedAt = Date.now();
	const render = () => ui.setStatus(key, `waiting for Pi to finish responding (${formatElapsed(Date.now() - startedAt)})`);
	render();
	const timer = setInterval(render, 1_000);
	return () => clearInterval(timer);
}

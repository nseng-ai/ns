export function unrefTimer(
	timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>,
): void {
	if (typeof timer !== "object" || timer === null || !("unref" in timer)) return;
	const unref = timer.unref;
	if (typeof unref === "function") unref.call(timer);
}

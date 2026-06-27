// THROWAWAY steelthread harness — human-readable relative time.
//
// The human surface shows "2 days ago" rather than a raw ISO stamp; the real rebuild keeps the
// ISO timestamp on the `--format json` machine path. `now` is passed in (anchored to a fixture
// reference date) so the prototype's output stays stable regardless of the real wall clock.

function ago(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"} ago`;
}

export function relativeTime(iso: string, nowMs: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return iso;
	const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return ago(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (hours < 24) return ago(hours, "hour");
	const days = Math.round(hours / 24);
	if (days < 7) return ago(days, "day");
	if (days < 30) return ago(Math.round(days / 7), "week");
	if (days < 365) return ago(Math.round(days / 30), "month");
	return ago(Math.round(days / 365), "year");
}

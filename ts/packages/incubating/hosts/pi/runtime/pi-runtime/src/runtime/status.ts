export interface RuntimeStatusTarget {
	hasUI: boolean;
	ui: {
		setStatus?(key: string, value: string | undefined): void;
	};
}

export function setRuntimeStatus(
	target: RuntimeStatusTarget,
	key: string,
	value: string | undefined,
): void {
	if (target.hasUI) {
		target.ui.setStatus?.(key, value);
	}
}

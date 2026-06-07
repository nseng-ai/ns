export interface LaunchStatusUi {
	setStatus?(key: string, value: string | undefined): void;
}

export interface LaunchStatusUpdater {
	hasUI: boolean;
	ui: LaunchStatusUi;
	statusKey: string;
}

export function setLaunchStatus(updater: LaunchStatusUpdater, value: string | undefined): void {
	if (updater.hasUI) {
		updater.ui.setStatus?.(updater.statusKey, value);
	}
}

import type {
	SetWidgetFunction,
	WidgetComponent,
	WidgetPlacement,
	WidgetTheme,
} from "../../src/runtime/tool-types.ts";

export const identityWidgetTheme: WidgetTheme = {
	fg: (_color, text) => text,
};

export interface WidgetFakeSnapshot {
	readonly key: string;
	readonly lines: string[] | undefined;
	readonly placement?: WidgetPlacement;
}

interface ComponentWidgetFakeOptions {
	readonly width?: number;
	readonly theme?: WidgetTheme;
	readonly onSnapshot?: (snapshot: WidgetFakeSnapshot) => void;
}

export class ComponentWidgetFake {
	readonly setWidget: SetWidgetFunction;
	private readonly snapshotLog: WidgetFakeSnapshot[] = [];
	private readonly width: number;
	private readonly theme: WidgetTheme;
	private readonly onSnapshot: ((snapshot: WidgetFakeSnapshot) => void) | undefined;
	private readonly components = new Map<string, WidgetComponent>();
	private readonly factoryInstallCounts = new Map<string, number>();
	private readonly renderRequestCounts = new Map<string, number>();

	constructor(options: ComponentWidgetFakeOptions = {}) {
		this.width = options.width ?? 100;
		this.theme = options.theme ?? identityWidgetTheme;
		this.onSnapshot = options.onSnapshot;
		this.setWidget = (key, content, widgetOptions): void => {
			this.components.get(key)?.dispose?.();
			this.components.delete(key);

			const placement = widgetOptions?.placement;
			if (content === undefined) {
				this.record({
					key,
					lines: undefined,
					...(placement === undefined ? {} : { placement }),
				});
				return;
			}
			if (Array.isArray(content)) {
				this.record({
					key,
					lines: [...content],
					...(placement === undefined ? {} : { placement }),
				});
				return;
			}

			this.factoryInstallCounts.set(key, this.factoryInstallCount(key) + 1);
			let component: WidgetComponent | undefined;
			const snapshot = (): void => {
				if (component === undefined || this.components.get(key) !== component) return;
				this.record({
					key,
					lines: component.render(this.width),
					...(placement === undefined ? {} : { placement }),
				});
			};
			const requestRender = (): void => {
				this.renderRequestCounts.set(key, this.renderRequestCount(key) + 1);
				snapshot();
			};
			component = content({ requestRender }, this.theme);
			this.components.set(key, component);
			snapshot();
		};
	}

	get snapshots(): readonly WidgetFakeSnapshot[] {
		return this.snapshotLog.map((snapshot) => ({
			...snapshot,
			...(snapshot.lines === undefined ? {} : { lines: [...snapshot.lines] }),
		}));
	}

	factoryInstallCount(key: string): number {
		return this.factoryInstallCounts.get(key) ?? 0;
	}

	renderRequestCount(key: string): number {
		return this.renderRequestCounts.get(key) ?? 0;
	}

	activeComponent(key: string): WidgetComponent | undefined {
		return this.components.get(key);
	}

	private record(snapshot: WidgetFakeSnapshot): void {
		const copy = {
			...snapshot,
			...(snapshot.lines === undefined ? {} : { lines: [...snapshot.lines] }),
		};
		this.snapshotLog.push(copy);
		this.onSnapshot?.(copy);
	}
}

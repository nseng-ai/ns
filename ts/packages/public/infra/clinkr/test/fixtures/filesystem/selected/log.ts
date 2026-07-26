const loads: string[] = [];

export function recordLoad(name: string): void {
	loads.push(name);
}

export function readLoads(): readonly string[] {
	return [...loads];
}

export function clearLoads(): void {
	loads.length = 0;
}

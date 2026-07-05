export async function importDefaultExport(specifier: string): Promise<unknown> {
	const module = (await import(specifier)) as { default?: unknown };
	return module.default;
}

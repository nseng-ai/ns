export function pythonStringRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

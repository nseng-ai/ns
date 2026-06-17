export function pythonStringRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

export function removeOneTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}

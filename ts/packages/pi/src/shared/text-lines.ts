export function splitTextLines(text: string): string[] {
	return text.split(/\r\n|\r|\n/u);
}

import { describe, expect, it } from "vitest";

import { PayloadError } from "../../../src/payloads/errors.ts";
import { resolveJsonPointer } from "../../../src/payloads/lookup.ts";

describe("resolveJsonPointer", () => {
	it("returns document for empty pointer", () => {
		const doc = { foo: "bar" };
		expect(resolveJsonPointer(doc, "")).toBe(doc);
	});

	it("resolves object property", () => {
		const doc = { foo: "bar", baz: { qux: 42 } };
		expect(resolveJsonPointer(doc, "/foo")).toBe("bar");
		expect(resolveJsonPointer(doc, "/baz/qux")).toBe(42);
	});

	it("resolves array index", () => {
		const doc = { items: ["a", "b", "c"] };
		expect(resolveJsonPointer(doc, "/items/0")).toBe("a");
		expect(resolveJsonPointer(doc, "/items/2")).toBe("c");
	});

	it("unescapes ~0 and ~1 in property names", () => {
		const doc = { "foo~bar": "value1", "baz/qux": "value2" };
		expect(resolveJsonPointer(doc, "/foo~0bar")).toBe("value1");
		expect(resolveJsonPointer(doc, "/baz~1qux")).toBe("value2");
	});

	it("throws for pointer not starting with /", () => {
		expect(() => resolveJsonPointer({}, "foo")).toThrow(PayloadError);
		expect(() => resolveJsonPointer({}, "foo")).toThrow(/must be empty or start with/);
	});

	it("throws for missing object key", () => {
		const doc = { foo: "bar" };
		expect(() => resolveJsonPointer(doc, "/missing")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/missing")).toThrow(/not found in object/);
	});

	it("throws for array index out of range", () => {
		const doc = { items: ["a", "b"] };
		expect(() => resolveJsonPointer(doc, "/items/5")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/items/5")).toThrow(/out of range/);
	});

	it("throws for invalid array index", () => {
		const doc = { items: ["a"] };
		expect(() => resolveJsonPointer(doc, "/items/00")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/items/00")).toThrow(/leading zeroes/);
		expect(() => resolveJsonPointer(doc, "/items/-")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/items/-")).toThrow(/not a valid array index/);
		expect(() => resolveJsonPointer(doc, "/items/abc")).toThrow(PayloadError);
	});

	it("throws for traversing scalar value", () => {
		const doc = { foo: "bar" };
		expect(() => resolveJsonPointer(doc, "/foo/baz")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/foo/baz")).toThrow(/cannot traverse scalar/);
	});

	it("throws for invalid escape sequences", () => {
		const doc = { "foo~bar": "value" };
		expect(() => resolveJsonPointer(doc, "/foo~2bar")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/foo~2bar")).toThrow(/Invalid JSON Pointer escape/);
		expect(() => resolveJsonPointer(doc, "/foo~")).toThrow(PayloadError);
		expect(() => resolveJsonPointer(doc, "/foo~")).toThrow(/trailing '~'/);
	});
});

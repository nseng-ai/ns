import { expect, test } from "vitest";
import {
	createArtifactIdGenerator,
	deriveEventId,
	deriveRevisionId,
	digestArtifactContent,
	parseArtifactId,
} from "@nseng-ai/gitplane";
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
test("generates a canonical artifact ID from the injected clock", () => {
	const generator = createArtifactIdGenerator({
		clock: { now: () => new Date(1_469_918_176_385) },
	});
	const generated = generator.generateArtifactId();
	expect(generated).toMatch(/^01aryz6s41[0123456789abcdefghjkmnpqrstvwxyz]{16}$/);
	expect(parseArtifactId(generated).ok).toBe(true);
});
const entries = [
	{
		path: "gitplane-artifact.json",
		kind: "regular-file" as const,
		bytes: Buffer.from('{"gpId":"x"}\n'),
	},
	{ path: "nested/a.txt", kind: "regular-file" as const, bytes: Buffer.from("hello") },
];
test("matches digest and revision vectors", () => {
	const digest = digestArtifactContent(entries);
	expect(digest).toMatchObject({
		ok: true,
		value: { text: "sha256:87e2f32ad9e0ec475ddd61fe00423d2d82aa87aab4ad9617d2eaf8e690b5ffbb" },
	});
	if (!digest.ok) throw new Error();
	expect(
		deriveRevisionId({ sourceId: "acme/greetings", artifactId, contentDigest: digest.value.bytes }),
	).toBe("gpr_sn82syfn7mtnw9q8zt4h40ea0t63zaz2phbvr4vp7crg1cg4vbz0");
});
test("outer location and mode are excluded while internal names and bytes matter", () => {
	const first = digestArtifactContent(entries);
	const mode = digestArtifactContent(entries.map((entry) => ({ ...entry, mode: "100755" })));
	const rename = digestArtifactContent(
		entries.map((entry) =>
			entry.path === "nested/a.txt" ? { ...entry, path: "nested/b.txt" } : entry,
		),
	);
	expect(first).toEqual(mode);
	expect(rename).not.toEqual(first);
});
test("rejects special entries", () => {
	for (const kind of ["symlink", "submodule", "directory", "special"] as const)
		expect(digestArtifactContent([{ path: "x", kind }])).toMatchObject({
			ok: false,
			code: "invalid-entry-kind",
		});
});

test.each(["", ".", "./", "a//b", "a/"])("rejects non-normalized path %j", (entryPath) => {
	expect(
		digestArtifactContent([{ path: entryPath, kind: "regular-file", bytes: new Uint8Array() }]),
	).toMatchObject({ ok: false, code: "invalid-path" });
});

test("rejects duplicate paths", () => {
	expect(
		digestArtifactContent([
			{ path: "same", kind: "regular-file", bytes: Buffer.from("one") },
			{ path: "same", kind: "regular-file", bytes: Buffer.from("two") },
		]),
	).toMatchObject({ ok: false, code: "invalid-path" });
});
test.each([
	["artifact.created", "gpe_3dd2fx5q2jdy81t6y165vyg20a4bzz2dbzzkevg2vh4hxe38sq6g"],
	["artifact.restored", "gpe_7mjg29cnrms1fnda1vx66k80ybx9pfatd2ypkn238ps9m0zmyz60"],
	["artifact.revised", "gpe_xbgdmg5q5bhpvycbg3cqgs2m29dbd7fx5vvj741r8fp738jw0sr0"],
	["artifact.moved", "gpe_rs70t2e81340af6ddnnxnpdmypd2s0htjsdf591kh0vmhwewk80g"],
	["artifact.deleted", "gpe_qsnz3x45z0ndy3b52pt9k786sxnxdbk71cy0efqg7jed2kycztwg"],
] as const)("matches %s event vector", (eventType, expected) =>
	expect(
		deriveEventId({
			sourceId: "acme/greetings",
			artifactId,
			reconciledCommit: "abc123",
			eventType,
		}),
	).toBe(expected),
);

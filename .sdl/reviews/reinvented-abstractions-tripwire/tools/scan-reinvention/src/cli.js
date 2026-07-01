import process from "node:process";
import { scanReinvention } from "./scan-reinvention.ts";
const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
    writeJson({ success: false, error: { code: parsed.code, message: parsed.message } });
    process.exitCode = 1;
}
else {
    const output = await scanReinvention({
        cwd: process.cwd(),
        diffBase: parsed.value.diffBase,
        files: parsed.value.files,
        isAddedOnly: parsed.value.isAddedOnly,
        kinds: parsed.value.kinds,
        shouldIncludeExempt: parsed.value.shouldIncludeExempt,
    });
    writeJson(output);
    if (!output.success)
        process.exitCode = 1;
}
export function parseArgs(args) {
    let diffBase = "";
    let isAddedOnly = true;
    let shouldIncludeExempt = false;
    const files = [];
    const kinds = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined)
            continue;
        switch (arg) {
            case "--diff-base": {
                const value = args[index + 1];
                if (value === undefined)
                    return parseFailure("missing-diff-base", "--diff-base requires a value.");
                diffBase = value;
                index += 1;
                break;
            }
            case "--files": {
                index += 1;
                while (index < args.length && !args[index]?.startsWith("--")) {
                    const file = args[index];
                    if (file !== undefined)
                        files.push(file);
                    index += 1;
                }
                index -= 1;
                break;
            }
            case "--kinds": {
                const value = args[index + 1];
                if (value === undefined)
                    return parseFailure("missing-kinds", "--kinds requires a value.");
                kinds.push(value);
                index += 1;
                break;
            }
            case "--added-only":
                isAddedOnly = true;
                break;
            case "--all-lines":
                isAddedOnly = false;
                break;
            case "--include-exempt":
                shouldIncludeExempt = true;
                break;
            default:
                return parseFailure("unknown-argument", `Unknown argument: ${arg}`);
        }
    }
    if (diffBase.trim() === "")
        return parseFailure("missing-diff-base", "--diff-base is required.");
    return { ok: true, value: { diffBase, files, isAddedOnly, kinds, shouldIncludeExempt } };
}
function parseFailure(code, message) {
    return { ok: false, code, message };
}
function writeJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

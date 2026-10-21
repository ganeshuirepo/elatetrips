import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spec = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(spec, "../../../..");
const specRelative = ".claude/elatetrips-specs/specs/034-policy-durability-acceptance/";
const moduleRelative = "elatetrips-node/src/modules/policy/";
const evidence = path.join(spec, "evidence");
const scopes = JSON.parse(readFileSync(path.join(spec, "scopes.json"), "utf8"));
function git(...args) {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr || "Git metadata audit failed");
  return run.stdout.trim();
}
function lines(text) { return text ? text.split(/\r?\n/).filter(Boolean) : []; }
function specPaths(directory = spec, prefix = specRelative) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? specPaths(path.join(directory, entry.name), prefix + entry.name + "/")
    : [prefix + entry.name]);
}
const priorCommits = scopes.checkpoints.map((checkpoint) => {
  const paths = lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", checkpoint.commit));
  const prefixes = [`.claude/elatetrips-specs/specs/${checkpoint.spec}/`, `elatetrips-node/src/modules/${checkpoint.module}/`];
  return { ...checkpoint, paths, violations: paths.filter((name) => !prefixes.some((prefix) => name.startsWith(prefix))) };
});
const currentPaths = [...new Set([...lines(git("diff", "--name-only", scopes.testedBase)), ...specPaths()])].sort();
const currentViolations = currentPaths.filter((name) => !name.startsWith(specRelative) && !name.startsWith(moduleRelative));
const sourceFiles = lines(git("ls-files", "--", moduleRelative)).map((name) => {
  const data = readFileSync(path.join(root, name));
  return { path: name, lines: data.toString("utf8").split(/\r?\n/).length - 1, sha256: createHash("sha256").update(data).digest("hex") };
});
const diff = git("diff", scopes.testedBase, "--", moduleRelative);
const documentationFiles = readdirSync(spec).filter((name) => /\.(md|mjs|json)$/.test(name));
const whitespaceViolations = documentationFiles.flatMap((name) => readFileSync(path.join(spec, name), "utf8").split(/\r?\n/).flatMap((line, index) => /[\t ]+$/.test(line) ? [`${name}:${index + 1}`] : []));
const sourceWhitespace = git("diff", "--check", scopes.testedBase, "--", moduleRelative);
const audit = {
  base: scopes.base, testedBase: scopes.testedBase, headBeforeAcceptanceCommit: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"), priorCommits, currentPaths, currentViolations,
  sourceFileCount: sourceFiles.length, sourceLineCount: sourceFiles.reduce((sum, entry) => sum + entry.lines, 0), sourceFiles,
  sourceDiff: { stat: git("diff", "--stat", scopes.testedBase, "--", moduleRelative), sha256: createHash("sha256").update(diff).digest("hex") },
  sourceWhitespace, documentationFiles, whitespaceViolations,
};
writeFileSync(path.join(evidence, "path-audit.json"), JSON.stringify(audit, null, 2) + "\n");
writeFileSync(path.join(evidence, "owned-source.patch"), diff + "\n");
if (priorCommits.some((entry) => entry.violations.length > 0) || currentViolations.length > 0 || whitespaceViolations.length > 0 || sourceWhitespace) throw new Error("Ownership or whitespace audit failed");
console.log(JSON.stringify({ priorCommits: priorCommits.length, ownershipViolations: 0, sourceFileCount: sourceFiles.length, sourceLineCount: audit.sourceLineCount, whitespaceViolations: 0 }));

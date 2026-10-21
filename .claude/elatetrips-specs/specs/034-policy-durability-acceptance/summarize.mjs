import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./audit.mjs";

const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), "evidence");
function read(name) { return readFileSync(path.join(evidence, name), "utf8"); }
function testCounts(name) {
  const counts = {};
  for (const match of read(name).matchAll(/^.*?\b(tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) counts[match[1]] = Number(match[2]);
  if (!counts.tests || counts.pass !== counts.tests || ["fail", "cancelled", "skipped", "todo"].some((key) => counts[key] !== 0)) throw new Error("Incomplete or unsuccessful test results: " + name);
  return counts;
}
const summary = JSON.parse(read("summary.json"));
if (!summary.checks.every((check) => check.passed)) throw new Error("Final required checks did not all pass");
const contractLog = read("contracts.log");
const contracts = JSON.parse(contractLog.slice(contractLog.indexOf("\n{") + 1));
const audit = JSON.parse(read("path-audit.json"));
Object.assign(summary, {
  finalRuns: 1,
  tests: { application: testCounts("application-tests.log"), harness: testCounts("harness-tests.log") },
  contracts,
  testedSource: {
    checkpoint: audit.testedBase, branch: audit.branch,
    policyFiles: audit.sourceFileCount, policyLines: audit.sourceLineCount,
    sourceDiff: audit.sourceDiff, hashes: audit.sourceFiles,
    runtimeChanges: 0, addedIntegrationRegressions: 1,
  },
  ownership: { auditedPriorCommits: audit.priorCommits.map((entry) => entry.commit), violations: 0, evidence: "path-audit.json" },
  integrationCapability: "Real policy producer and binding through configured foundation Mongo snapshot store, tested against a local Mongo replica set with fixture trusted ports; durable reopen/read/estimate and strict writer replay verified.",
  eventAccounting: {
    internalOutboxRowsPerCommit: 2,
    authoritativeDomainEvent: "Authenticated foundation audit kind policy-snapshot, after.request.event",
    nestedProducerEvent: "Validation proof only; not separately dispatched",
    publisherWired: false,
  },
  trustBoundaries: [
    "Authoritative accepted-record loader and exact durable evidence verifier are required trusted ports; caller JSON is not consent.",
    "Fresh token/account/membership/permission/configuration and booking scope/binding resolvers remain trusted adapter boundaries.",
    "Foundation owns encryption, integrity, atomic snapshot/event reservations and receipts; producer SHA-256 is advisory proposal evidence.",
    "Tenant and booking/context/quote/partner equality are validated; organization or brand eligibility belongs to authoritative identity and booking adapters.",
  ],
  remaining: [
    "Production accepted cart/proposal/consent evidence adapter and commercial policy/configuration ownership.",
    "Production identity/membership/permissions and booking scope resolver, database/key lifecycle and service/container/router wiring.",
    "Domain-event dispatcher/publisher plus downstream idempotent consumers and delivery operation evidence.",
    "Verified financial ledger/payment capture, checkout revalidation, provider cancellation, inventory release and refund settlement adapters.",
    "Broader DEV-006/008/053/056 acceptance, commercial authorization, supported supplier certification and human Gates R1/R2.",
  ],
});
writeFileSync(path.join(evidence, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ tests: summary.tests, contracts: { schemas: contracts.schemas, fixtures: contracts.fixtures }, wholeLint: summary.wholeLint, source: { files: audit.sourceFileCount, lines: audit.sourceLineCount } }));

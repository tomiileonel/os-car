import { execFileSync } from "node:child_process";

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const checks = [];

// Lightweight non-destructive checks only
checks.push(["git diff --check", run("git", ["diff", "--check"])]);

const hasPackageJson = run("node", ["-e", "require('fs').accessSync('package.json')"]);
if (hasPackageJson) {
  checks.push(["typecheck", run("npm", ["run", "typecheck", "--if-present"])]);  
  checks.push(["lint", run("npm", ["run", "lint", "--if-present"])]);
}

const failed = checks.filter(([, ok]) => !ok);

if (failed.length === 0) {
  console.log(JSON.stringify({ decision: "allow", reason: "Stop gate passed." }));
  process.exit(0);
}

console.log(JSON.stringify({
  decision: "block",
  reason: "Stop gate found failed local verification checks.",
  failed: failed.map(([name]) => name)
}));
process.exit(2);

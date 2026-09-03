const rawInput = await readStdin();

if (rawInput.trim().length === 0) {
  emitDecision({ decision: "allow", reason: "No command payload was provided." });
  process.exit(0);
}

let payload;

try {
  payload = JSON.parse(rawInput);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
  emitDecision({ decision: "deny", reason: "Invalid hook payload: " + message });
  process.exit(0);
}

const commandLine = extractCommandLine(payload);

const denyPatterns = [
  /\brm\s+-rf\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/s\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-f/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bDROP\s+(DATABASE|SCHEMA)\b/i,
];

const approvalPatterns = [
  /\b(?:prisma|npx\s+prisma|pnpm\s+prisma)\s+migrate\s+(?:dev|deploy)\b/i,
  /\bdocker\s+(?:rm|system\s+prune)\b/i,
  /\bterraform\s+(?:apply|destroy)\b/i,
  /\bgit\s+push\b/i,
];

const secretPatterns = [
  /(^|[\s"'=])\.env(?:\.[A-Za-z0-9._-]+)?($|[\s"'=])/i,
  /id_rsa|id_ed25519|[\\/]\.ssh[\\/]/i,
];

if (denyPatterns.some((pattern) => pattern.test(commandLine))) {
  emitDecision({ decision: "deny", reason: "Blocked destructive or irreversible command." });
} else if (secretPatterns.some((pattern) => pattern.test(commandLine))) {
  emitDecision({ decision: "deny", reason: "Direct secret or credential file access is blocked." });
} else if (approvalPatterns.some((pattern) => pattern.test(commandLine))) {
  emitDecision({ decision: "force_ask", reason: "External-state, migration, history or infrastructure operation requires explicit approval." });
} else {
  emitDecision({ decision: "allow", reason: "Command passed the safety gate." });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (error) => reject(error));
  });
}

function extractCommandLine(value) {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const toolCall = value.toolCall;
  if (typeof toolCall !== "object" || toolCall === null) {
    return "";
  }

  const args = toolCall.args;
  if (typeof args !== "object" || args === null) {
    return "";
  }

  const command = args.CommandLine ?? args.commandLine ?? args.command;
  return typeof command === "string" ? command : "";
}

function emitDecision(decision) {
  process.stdout.write(JSON.stringify(decision) + "\n");
}

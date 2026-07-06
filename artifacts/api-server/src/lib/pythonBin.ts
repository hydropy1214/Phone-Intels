import fs from "node:fs";

// The Node dev server's PATH doesn't always include Replit's Python venv
// bin dir (.pythonlibs/bin), even though a shell session's PATH does — so a
// bare "python3" can ENOENT under spawn() despite working fine in the shell.
// Resolve explicitly to the workspace venv binary when present, with a
// PHONE_TOOL_PYTHON env override for any environment that needs it.
const CANDIDATE_PATHS = [
  process.env.PHONE_TOOL_PYTHON,
  "/home/runner/workspace/.pythonlibs/bin/python3",
].filter((p): p is string => Boolean(p));

function resolvePythonBin(): string {
  for (const candidate of CANDIDATE_PATHS) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return "python3";
}

export const PYTHON_BIN = resolvePythonBin();

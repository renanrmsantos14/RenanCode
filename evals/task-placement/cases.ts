/** Each case names where the task must run. Ambiguous wording is left out on purpose. */
export const taskPlacementCases = [
  // Cloud: the repository alone supports the work.
  {
    id: "refactor-with-tests",
    source: "Claude cloud auto routing design",
    task: "Refactor the settings parser into smaller functions and add unit tests for the edge cases.",
    expected: "cloud",
  },
  {
    id: "issue-bug-fix",
    source: "Claude cloud auto routing design",
    task: "Fix the bug from issue #412: archived threads still show in search results. Open a PR.",
    expected: "cloud",
  },
  {
    id: "review-pr-pt",
    source: "Claude cloud auto routing design, Portuguese phrasing",
    task: "Revise o PR 88 e aponte problemas de concorrência no worker de checkpoints.",
    expected: "cloud",
  },
  {
    id: "docs",
    source: "Claude cloud auto routing design",
    task: "Document the keybindings settings in docs/user/keybindings.md.",
    expected: "cloud",
  },
  {
    id: "run-tests-in-repo",
    source: "Control: running tests is fine in the cloud container",
    task: "Run the server test suite and fix whatever fails.",
    expected: "cloud",
  },
  // Local: the task needs this machine.
  {
    id: "ios-simulator",
    source: "Claude cloud auto routing design",
    task: "Open the app in the iOS simulator and check the login screen layout.",
    expected: "local",
  },
  {
    id: "localhost-blank",
    source: "Claude cloud auto routing design",
    task: "Why is http://localhost:5173 showing a blank page right now?",
    expected: "local",
  },
  {
    id: "env-credentials-pt",
    source: "Claude cloud auto routing design, Portuguese phrasing",
    task: "Use as credenciais do meu .env de staging para rodar a migração no banco.",
    expected: "local",
  },
  {
    id: "kill-dev-server",
    source: "Claude cloud auto routing design",
    task: "Something is stuck on port 3000, find it and stop it.",
    expected: "local",
  },
  {
    id: "downloads-file",
    source: "Claude cloud auto routing design",
    task: "Read the CSV in my Downloads folder and import it into the seed data.",
    expected: "local",
  },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly source: string;
  readonly task: string;
  readonly expected: "cloud" | "local";
}>;

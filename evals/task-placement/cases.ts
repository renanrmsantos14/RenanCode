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
  {
    id: "code-question-pt",
    source: "Control: a question the code answers, Portuguese phrasing",
    task: "Como funciona o cálculo de checkpoints? Onde fica a lógica que decide quando criar um novo?",
    expected: "cloud",
  },
  {
    id: "non-visual-feature",
    source: "Control for visual-ui: a feature with nothing to review on screen",
    task: "Add exponential backoff to the provider health check and cover it with unit tests.",
    expected: "cloud",
  },
  {
    id: "named-repo-doc",
    source: "Task placement control for open-file wording",
    task: "Fix the typos in docs/setup.md and keep the headings as they are.",
    expected: "cloud",
  },
  {
    id: "write-deploy-workflow",
    source: "Task placement control for deploy wording",
    task: "Add a GitHub Actions workflow that runs the deploy script when main is merged.",
    expected: "cloud",
  },
  // Local: the task needs this machine or something outside the repository.
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
    id: "local-docker-container",
    source: "Services running on this machine",
    task: "Look at the logs of the Postgres container running in my Docker and tell me why it keeps restarting.",
    expected: "local",
  },
  {
    id: "downloads-file",
    source: "Claude cloud auto routing design",
    task: "Read the CSV in my Downloads folder and import it into the seed data.",
    expected: "local",
  },
  {
    id: "live-dataverse-pt",
    source: "Live systems outside the repository, Portuguese phrasing",
    task: "Consulte no Dataverse de produção os pedidos com status pendente e me diga quantos são.",
    expected: "local",
  },
  {
    id: "own-app-state",
    source: "The app's own state",
    task: "How many tokens did my sessions use this week, and which one cost the most?",
    expected: "local",
  },
  {
    id: "visual-ui",
    source: "Visual UI work the user reviews on screen",
    task: "Redesign the sidebar header: tighter spacing, a softer hover state and a smoother collapse animation.",
    expected: "local",
  },
  {
    id: "plan-with-user",
    source: "Planning a feature with the user",
    task: "Let's brainstorm how thread folders should work, then agree on a plan before building anything.",
    expected: "local",
  },
  {
    id: "open-file-now",
    source: "Task placement local signal",
    task: "Fix the function in the file I have open right now.",
    expected: "local",
  },
  {
    id: "publish-now",
    source: "Task placement local signal",
    task: "Run pnpm push and publish this web resource to the DEV environment.",
    expected: "local",
  },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly source: string;
  readonly task: string;
  readonly expected: "cloud" | "local";
}>;

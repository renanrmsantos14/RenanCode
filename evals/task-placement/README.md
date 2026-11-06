# Task placement

Checks the classifier that decides whether a new Claude task runs in a Claude cloud session or on the user's machine (Settings > Labs > Send tasks to the cloud automatically). It runs the server's Codex text generator with the real placement prompt and compares each answer with the expected placement.

## Run

```sh
cd evals
pnpm task-placement --model <codex model> --out runs/placement
pnpm task-placement --model <codex model> --out runs/placement-one --case ios-simulator --samples 1
```

- It uses your local Codex login, like the server does.
- `--samples <n>` (default 3). A case fails when half or more of its samples answer the wrong placement.
- A run writes `results.json` (every answer and reason) and `summary.md`.
- Cost: one short call per sample, about 1K input tokens each. A full run is 63 calls.

## Add a case

Add an entry to `cases.ts` with an `id`, a `source`, the `task` text, and the `expected` placement. Keep tasks that name no clear need out of the `local` side: the classifier answers `cloud` when nothing clearly requires this machine. Add a control on the other side for every new case.

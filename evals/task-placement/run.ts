#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeUtil from "node:util";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { CodexSettings, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as CodexTextGeneration from "../../apps/server/src/textGeneration/CodexTextGeneration.ts";
import * as ProcessRunner from "../../apps/server/src/processRunner.ts";
import * as ServerConfig from "../../apps/server/src/config.ts";
import { taskPlacementCases } from "./cases.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    model: { type: "string" },
    out: { type: "string" },
    case: { type: "string", multiple: true },
    samples: { type: "string", default: "3" },
  },
});
if (!values.model || !values.out) throw new Error("Use --model <codex model> --out <directory>.");
const model = values.model;
const outputDirectory = values.out;
const samples = Number(values.samples);
const cases = values.case
  ? taskPlacementCases.filter((fixture) => values.case?.includes(fixture.id))
  : taskPlacementCases;
const decodeSettings = Schema.decodeUnknownEffect(CodexSettings);
const encodeReport = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "t3-placement-evaluation-" });
    const generation = yield* CodexTextGeneration.makeCodexTextGeneration(
      yield* decodeSettings({}),
    );
    const results = [];
    for (const fixture of cases) {
      const answers = [];
      for (let sample = 0; sample < samples; sample++) {
        answers.push(
          yield* generation.generateTaskPlacement({
            cwd,
            message: fixture.task,
            modelSelection: { instanceId: ProviderInstanceId.make("codex"), model },
          }),
        );
      }
      const misses = answers.filter((answer) => answer.placement !== fixture.expected).length;
      // A case fails when half or more of its samples fail.
      results.push({ ...fixture, passed: misses * 2 < answers.length, answers });
    }
    const failed = results.filter((result) => !result.passed);
    const summary = [
      `# Task placement: ${model}`,
      "",
      `${results.length - failed.length}/${results.length} cases passed, ${samples} samples each.`,
      "",
      ...failed.map(
        (result) =>
          `- FAIL ${result.id} (expected ${result.expected}): ${result.answers.map((answer) => `${answer.placement} "${answer.reason}"`).join("; ")}`,
      ),
    ].join("\n");
    yield* fs.makeDirectory(outputDirectory, { recursive: true });
    yield* fs.writeFileString(
      path.join(outputDirectory, "results.json"),
      yield* encodeReport(results),
    );
    yield* fs.writeFileString(path.join(outputDirectory, "summary.md"), `${summary}\n`);
    yield* Effect.log(summary);
  }).pipe(
    Effect.provide(
      ProcessRunner.layer.pipe(
        Layer.provideMerge(
          ServerConfig.layerTest(process.cwd(), { prefix: "t3-placement-evaluation-state-" }),
        ),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
    Effect.scoped,
  ),
);

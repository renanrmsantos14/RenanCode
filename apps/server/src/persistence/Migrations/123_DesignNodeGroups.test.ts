import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("123_DesignNodeGroups", (it) => {
  it.effect("adds the group columns and keeps existing nodes ungrouped", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 122 });
      yield* sql`
        INSERT INTO design_canvas_nodes
          (node_id, thread_id, kind, sketch_id, x, y, width, height, z, created_at, updated_at)
        VALUES ('n1', 't1', 'sketch', 's1', 0, 0, 1280, 900, 0, '2026-11-24', '2026-11-24')
      `;
      yield* runMigrations();
      yield* sql`
        INSERT INTO design_canvas_nodes
          (node_id, thread_id, kind, sketch_id, x, y, width, height, z, group_id, group_label, created_at, updated_at)
        VALUES ('n2', 't1', 'sketch', 's2', 0, 0, 1280, 900, 1, 'g1', 'Login', '2026-11-25', '2026-11-25')
      `;
      const rows = yield* sql<{
        node_id: string;
        group_id: string | null;
        group_label: string | null;
      }>`
        SELECT node_id, group_id, group_label FROM design_canvas_nodes ORDER BY z
      `;
      assert.deepStrictEqual(rows, [
        { node_id: "n1", group_id: null, group_label: null },
        { node_id: "n2", group_id: "g1", group_label: "Login" },
      ]);
    }),
  );
});

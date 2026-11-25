import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("121_DesignCanvas", (it) => {
  it.effect("creates the sketch, node and viewport tables with their indexes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 113 });
      yield* runMigrations();
      yield* sql`
        INSERT INTO design_sketches
          (sketch_id, project_id, origin_thread_id, title, html_attachment_id, width, height, created_at)
        VALUES ('s1', 'p1', 't1', 'Home', 'design-p1-1-html', 1280, 900, '2026-11-24')
      `;
      yield* sql`
        INSERT INTO design_canvas_nodes
          (node_id, thread_id, kind, sketch_id, x, y, width, height, z, created_at, updated_at)
        VALUES ('n1', 't1', 'sketch', 's1', 0, 0, 1280, 900, 0, '2026-11-24', '2026-11-24')
      `;
      yield* sql`
        INSERT INTO design_canvas_viewports (thread_id, x, y, zoom, updated_at)
        VALUES ('t1', 10, 20, 0.5, '2026-11-24')
      `;
      const sketches = yield* sql<{
        group_id: string | null;
        thumbnail_attachment_id: string | null;
      }>`
        SELECT group_id, thumbnail_attachment_id FROM design_sketches WHERE sketch_id = 's1'
      `;
      assert.deepStrictEqual(sketches, [{ group_id: null, thumbnail_attachment_id: null }]);
      const indexes = yield* sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_design_%'
      `;
      assert.deepStrictEqual(indexes.map((row) => row.name).toSorted(), [
        "idx_design_canvas_nodes_thread",
        "idx_design_sketches_origin_thread",
        "idx_design_sketches_project",
      ]);
    }),
  );
});

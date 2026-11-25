import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("122_DesignFrames", (it) => {
  it.effect("adds the frame columns and keeps existing sketch nodes readable", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 121 });
      yield* sql`
        INSERT INTO design_canvas_nodes
          (node_id, thread_id, kind, sketch_id, x, y, width, height, z, created_at, updated_at)
        VALUES ('n1', 't1', 'sketch', 's1', 0, 0, 1280, 900, 0, '2026-11-24', '2026-11-24')
      `;
      yield* runMigrations();
      yield* sql`
        INSERT INTO design_canvas_nodes
          (node_id, thread_id, kind, url, device, title, snapshot_attachment_id, x, y, width, height, z, created_at, updated_at)
        VALUES ('n2', 't1', 'frame', 'http://localhost:3000/', 'mobile', 'Home', 'design-p1-1-snap', 0, 0, 390, 844, 1, '2026-11-25', '2026-11-25')
      `;
      yield* sql`INSERT INTO design_canvas_auto_frames (thread_id, created_at) VALUES ('t1', '2026-11-25')`;
      const rows = yield* sql<{ kind: string; url: string | null; device: string | null }>`
        SELECT kind, url, device FROM design_canvas_nodes ORDER BY z
      `;
      assert.deepStrictEqual(rows, [
        { kind: "sketch", url: null, device: null },
        { kind: "frame", url: "http://localhost:3000/", device: "mobile" },
      ]);
    }),
  );
});

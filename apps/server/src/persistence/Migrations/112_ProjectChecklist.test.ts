import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("112_ProjectChecklist", (it) => {
  it.effect("creates the checklist table and its sibling index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 111 });
      yield* runMigrations();
      yield* sql`
        INSERT INTO project_checklist_items
          (id, project_id, parent_id, title, position, created_at, updated_at)
        VALUES ('i1', 'p1', NULL, 'Module', 0, '2026-11-23', '2026-11-23')
      `;
      const rows = yield* sql<{ done: number; due_date: string | null }>`
        SELECT done, due_date FROM project_checklist_items WHERE id = 'i1'
      `;
      assert.deepStrictEqual(rows, [{ done: 0, due_date: null }]);
      const indexes = yield* sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'project_checklist_items'
      `;
      assert.isTrue(indexes.some((row) => row.name === "idx_project_checklist_items_siblings"));
    }),
  );
});

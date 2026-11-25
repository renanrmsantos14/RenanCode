import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // A sketch outlives the thread that made it, so origin_thread_id has no foreign key.
  yield* sql`
    CREATE TABLE IF NOT EXISTS design_sketches (
      sketch_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      origin_thread_id TEXT NOT NULL,
      group_id TEXT,
      based_on_sketch_id TEXT,
      title TEXT NOT NULL,
      label TEXT,
      html_attachment_id TEXT NOT NULL,
      thumbnail_attachment_id TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_design_sketches_project
    ON design_sketches(project_id, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_design_sketches_origin_thread
    ON design_sketches(origin_thread_id)
  `;
  // `kind` is 'sketch' today; phase 2 adds 'frame' without another migration.
  yield* sql`
    CREATE TABLE IF NOT EXISTS design_canvas_nodes (
      node_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sketch_id TEXT,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      z INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_design_canvas_nodes_thread
    ON design_canvas_nodes(thread_id)
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS design_canvas_viewports (
      thread_id TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      zoom REAL NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});

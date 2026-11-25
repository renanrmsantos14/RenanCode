import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Frame nodes reuse design_canvas_nodes (kind = 'frame'); sketch rows leave these NULL.
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN url TEXT`;
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN device TEXT`;
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN title TEXT`;
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN snapshot_attachment_id TEXT`;
  // Outlives the frame node on purpose: a user who deleted the automatic Frame must not get it back.
  yield* sql`
    CREATE TABLE IF NOT EXISTS design_canvas_auto_frames (
      thread_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    )
  `;
});

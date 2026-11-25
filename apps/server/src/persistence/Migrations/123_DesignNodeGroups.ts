import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Set by the agent's design_canvas_arrange; a node is grouped per canvas, so sketches stay shareable.
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN group_id TEXT`;
  yield* sql`ALTER TABLE design_canvas_nodes ADD COLUMN group_label TEXT`;
});

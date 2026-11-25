import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Drops a thread's canvas; sketches stay because they belong to the project. Frame prints carry the thread prefix, so the thread's attachment sweep removes them. */
export const deleteThreadCanvas = Effect.fn("Design.deleteThreadCanvas")(function* (
  threadId: string,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`DELETE FROM design_canvas_nodes WHERE thread_id = ${threadId}`;
      yield* sql`DELETE FROM design_canvas_viewports WHERE thread_id = ${threadId}`;
      yield* sql`DELETE FROM design_canvas_auto_frames WHERE thread_id = ${threadId}`;
    }),
  );
});

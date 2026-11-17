import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_modules (
      module_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_module_id TEXT,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      waiting_reason TEXT,
      due_date TEXT,
      position INTEGER NOT NULL,
      status_changed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_work_modules_siblings
    ON work_modules(project_id, parent_module_id, position)
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS work_module_threads (
      thread_id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      suggested INTEGER NOT NULL,
      linked_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_work_module_threads_module ON work_module_threads(module_id)
  `;
});

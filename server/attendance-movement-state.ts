/**
 * Exclusions are reversible audit events, not deleted punches. The latest
 * exclusion decision wins; unrelated time/medical edits do not reinstate a punch.
 * Aliases here are application-owned identifiers, never request input.
 */
export function activeMovementSql(alias = "attendance_records") {
  if (!/^[a-z_]+$/.test(alias)) throw new Error("Invalid attendance SQL alias");
  return `COALESCE((SELECT a.action FROM attendance_audit_log a
    WHERE a.record_id=${alias}.id AND a.action IN ('movement_void','movement_restore')
    ORDER BY a.id DESC LIMIT 1),'') <> 'movement_void'`;
}

export function movementVersionSql(alias = "r") {
  return `(SELECT COALESCE(MAX(a.id),0)::integer FROM attendance_audit_log a WHERE a.record_id=${alias}.id)`;
}

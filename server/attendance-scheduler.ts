import { pool } from "./db";
import { reconcileAttendance } from "./attendance-support";
import { riyadhDateKey } from "../shared/attendance";

/** DB session lock prevents overlap across autoscale instances or slow ticks. */
export async function runAttendanceCatchup() {
  const client = await pool.connect();
  let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(610281941) AS locked")).rows[0].locked;
    if(!locked)return;
    const {rows:[last]}=await client.query("SELECT last_day FROM attendance_job_state WHERE id='reconciliation'");
    const today=riyadhDateKey(new Date());
    const prior=last?.last_day || riyadhDateKey(new Date(Date.now()-2*86400000));
    const start=Math.max(Date.parse(prior),Date.parse(today)-31*86400000);
    for(let time=start;time<=Date.parse(today);time+=86400000) {
      const day=new Date(time).toISOString().slice(0,10);
      await reconcileAttendance(day);
      await client.query(`INSERT INTO attendance_job_state(id,last_day) VALUES('reconciliation',$1)
        ON CONFLICT(id) DO UPDATE SET last_day=$1,updated_at=now()`,[day]);
    }
  } finally {
    if(locked) await client.query("SELECT pg_advisory_unlock(610281941)").catch(()=>{});
    client.release();
  }
}

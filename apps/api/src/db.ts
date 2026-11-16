import pg from 'pg';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:15,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true}:undefined});
export async function transaction<T>(fn:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}
 catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
export type Database=Pick<pg.PoolClient,'query'>;
export async function queryOne<T=any>(sql:string,args:any[]=[],db:Database=pool):Promise<T|undefined>{const r=await db.query(sql,args);return r.rows[0] as T|undefined}
// One short transaction lock covers this single-salon application's booking and
// management writes. Availability is rechecked after acquiring it. PostgreSQL's
// appointment exclusion constraint remains the final double-booking protection.
export async function schedulingLock(db:Database){
 await db.query("SELECT pg_advisory_xact_lock(hashtext('vivablue-scheduling:' || current_schema()))");
}

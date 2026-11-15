import pg from 'pg';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:15,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true}:undefined});
export async function transaction<T>(fn:(client:pg.PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}
 catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
export async function queryOne<T=any>(sql:string,args:any[]=[]):Promise<T|undefined>{const r=await pool.query(sql,args);return r.rows[0] as T|undefined}

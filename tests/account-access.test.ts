import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ensureLegacyAccount} from '../lib/account-access.ts';

function setup(){
  const sql=new DatabaseSync(':memory:');
  for(const name of ['0000_small_warbound','0001_assessments'])
    sql.exec(readFileSync(new URL(`../drizzle/${name}.sql`,import.meta.url),'utf8'));
  function prepare(query:string){let params:any[]=[];return{
    bind(...args:any[]){params=args;return this;},
    async first(){return sql.prepare(query).get(...params)||null;},
    async run(){return sql.prepare(query).run(...params);}
  };}
  const db={prepare,async batch(statements:any[]){
    sql.exec('BEGIN');try{for(const s of statements)await s.run();sql.exec('COMMIT');}
    catch(e){sql.exec('ROLLBACK');throw e;}
  }} as unknown as D1Database;
  const migrate=()=>sql.exec(readFileSync(new URL('../drizzle/0002_b2c_accounts.sql',import.meta.url),'utf8'));
  return {sql,db,migrate};
}
const user=(id:string,isAdmin=false)=>({userId:id,displayName:id,email:null,isAdmin});

test('account migration preserves all seed content and existing learner records',async()=>{
 const {sql,db,migrate}=setup();
 try{
  const seed=JSON.parse(readFileSync(new URL('../content/seed.json',import.meta.url),'utf8'));
  for(const [kind,items] of Object.entries(seed))for(const item of items as any[])
    sql.prepare('INSERT INTO content VALUES (?,?,?,?,?)').run(item.id,kind,JSON.stringify(item),'published','before');
  for(const id of ['owner','sofia']){
    sql.prepare('INSERT INTO profiles VALUES (?,?,?)').run(id,id,80);
    sql.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)').run(id,id,'lesson','offer','true',1,25,'2026-10-20','before');
    sql.prepare('INSERT INTO reviews VALUES (?,?,?,?,?)').run(id,'card',2,'later','good');
    sql.prepare('INSERT INTO bookmarks VALUES (?,?)').run(id,'document');
    sql.prepare('INSERT INTO assessment_attempts (id,user_id,target_key,mode,branch_id,target,title,questions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id,id,'topic:offer','topic','civil','offer','Оферта','[]','before','before');
  }
  const tables=['content','profiles','events','reviews','bookmarks','assessment_attempts'];
  const before=tables.map(t=>sql.prepare(`SELECT * FROM ${t} ORDER BY 1,2`).all());
  migrate();
  for(const id of ['owner','sofia']){
    assert.equal((await ensureLegacyAccount(db,user(id,id==='owner'))).kind,'internal');
    await ensureLegacyAccount(db,user(id,id==='owner'));
  }
  assert.deepEqual(tables.map(t=>sql.prepare(`SELECT * FROM ${t} ORDER BY 1,2`).all()),before);
  assert.equal(sql.prepare('SELECT count(*) n FROM accounts').get()!.n,2);
  assert.equal(sql.prepare('SELECT count(*) n FROM internal_access').get()!.n,2);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{sql.close();}
});

test('internal access is independent of the administrative role and exact identity is required',async()=>{
 const {sql,db,migrate}=setup();migrate();
 try{
  const sofia=user('sofia');assert.equal((await ensureLegacyAccount(db,sofia)).kind,'internal');
  assert.equal(sofia.isAdmin,false);
  assert.equal((await ensureLegacyAccount(db,user('another-admin',true))).kind,'legacy');
  assert.equal((await ensureLegacyAccount(db,user('SOFIA'))).kind,'legacy');
  assert.equal((await ensureLegacyAccount(db,user('editorial-service',true))).kind,'legacy');
 }finally{sql.close();}
});

test('loading an existing account cannot restore a revoked grant or overwrite verified identity',async()=>{
 const {sql,db,migrate}=setup();migrate();
 try{
  await ensureLegacyAccount(db,user('sofia'));
  sql.exec("UPDATE accounts SET email='verified@example.test',email_verified_at='verified' WHERE id='sofia'");
  sql.exec("UPDATE internal_access SET revoked_at='revoked' WHERE user_id='sofia'");
  assert.equal((await ensureLegacyAccount(db,user('sofia'))).kind,'legacy');
  assert.equal(sql.prepare("SELECT email FROM accounts WHERE id='sofia'").get()!.email,'verified@example.test');
 }finally{sql.close();}
});

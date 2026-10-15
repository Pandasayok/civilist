import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {importCourse} from '../lib/course-import.ts';
const seed=JSON.parse(readFileSync(new URL('../content/seed.json',import.meta.url),'utf8'));
const pack=JSON.parse(readFileSync(new URL('../content/course-contracts.json',import.meta.url),'utf8'));
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0000_small_warbound.sql',import.meta.url),'utf8'));
 function prepare(query:string){let params:any[]=[];return{bind(...args:any[]){params=args;return this;},async first(){return sql.prepare(query).get(...params)||null;},async all(){return{results:sql.prepare(query).all(...params)};},async run(){return sql.prepare(query).run(...params);}};}
 const db={prepare,async batch(statements:any[]){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 return{sql,db};
}
test('course upgrade preserves IDs, user progress and editor changes, and can resume',async()=>{
 const {sql,db}=setup();const original=seed.lessons.find((l:any)=>l.id==='offer');
 sql.prepare("INSERT INTO content VALUES (?,'lesson',?,'published','before')").run(original.id,JSON.stringify(original));
 const edited={...pack.lessons[0],title:'Авторская правка'};sql.prepare("INSERT INTO content VALUES (?,'lesson',?,'draft','before')").run(edited.id,JSON.stringify(edited));
 sql.prepare("INSERT INTO events VALUES ('progress','user','lesson','offer','{}',NULL,10,'2026-10-04','before')").run();
 await importCourse(db);
 const upgraded=sql.prepare("SELECT body FROM content WHERE id='offer'").get() as any;assert.equal(JSON.parse(upgraded.body).sections.length,4);
 const preserved=sql.prepare('SELECT body,status FROM content WHERE id=?').get(edited.id) as any;assert.equal(preserved.status,'draft');assert.equal(JSON.parse(preserved.body).title,'Авторская правка');
 assert.equal((sql.prepare("SELECT SUM(xp) xp FROM events WHERE user_id='user'").get() as any).xp,10);
 const meta=JSON.parse((sql.prepare('SELECT value FROM metadata WHERE key=?').get('course:'+pack.version) as any).value);assert.deepEqual(meta.conflicts,[edited.id]);
 const count=(sql.prepare('SELECT COUNT(*) n FROM content').get() as any).n;
 // Simulate interrupted import after material writes but before marker write.
 sql.prepare('DELETE FROM metadata WHERE key=?').run('course:'+pack.version);await importCourse(db);await importCourse(db);
 assert.equal((sql.prepare('SELECT COUNT(*) n FROM content').get() as any).n,count);
 assert.equal((sql.prepare('SELECT COUNT(*) n FROM events').get() as any).n,1);sql.close();
});

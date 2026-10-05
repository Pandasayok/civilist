import pack from '../content/course-contracts.json' with {type:'json'};
import seed from '../content/seed.json' with {type:'json'};
// Additions are idempotent. Only an untouched published seed can be upgraded.
// Administrator edits and drafts always win; conflicts are reported in metadata.
export async function importCourse(database:D1Database){
 const key='course:'+pack.version;
 if(await database.prepare('SELECT value FROM metadata WHERE key=?').bind(key).first())return;
 const statements:D1PreparedStatement[]=[];
 for(const [kind,items,originals] of [['lesson',pack.lessons,seed.lessons],['question',pack.questions,seed.questions]] as const){
  for(const body of items){
   const original=originals.find(x=>x.id===body.id);
   if(original)statements.push(database.prepare("UPDATE content SET body=?,updated_at=? WHERE id=? AND kind=? AND status='published' AND body=?").bind(JSON.stringify(body),new Date().toISOString(),body.id,kind,JSON.stringify(original)));
   statements.push(database.prepare("INSERT OR IGNORE INTO content (id,kind,body,status,updated_at) VALUES (?,?,?,'published',?)").bind(body.id,kind,JSON.stringify(body),new Date().toISOString()));
  }
 }
 for(let i=0;i<statements.length;i+=40)await database.batch(statements.slice(i,i+40));
 const expected=new Map([...pack.lessons,...pack.questions].map(x=>[x.id,JSON.stringify(x)]));
 const rows=await database.prepare('SELECT id,body,status FROM content WHERE id IN ('+[...expected.keys()].map(()=>'?').join(',')+')').bind(...expected.keys()).all<{id:string;body:string;status:string}>();
 const conflicts=rows.results.filter(r=>r.status!=='published'||r.body!==expected.get(r.id)).map(r=>r.id);
 await database.prepare('INSERT OR IGNORE INTO metadata (key,value) VALUES (?,?)').bind(key,JSON.stringify({appliedAt:new Date().toISOString(),conflicts})).run();
}

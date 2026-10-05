import {importCourse} from "./course-import";
import {env} from "cloudflare:workers";
import seed from "@/content/seed.json";
import type {Content,Event,Review,State,Kind} from "./civilist-types";
import {collection} from "./civilist-types";

export function db():D1Database {if(!env.DB)throw new Error("Database unavailable");return env.DB;}
export function config(key:string):string {return (env as unknown as Record<string,string>)[key]||"";}
export function moscowDay(date=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
export async function ensureSeed(){
  if(!await db().prepare("SELECT value FROM metadata WHERE key = ?").bind("seed-v1").first()){
  const statements=(Object.keys(collection) as Kind[]).flatMap(kind=>(seed[collection[kind]] as {id:string}[]).map(body=>db().prepare("INSERT OR IGNORE INTO content (id,kind,body,status,updated_at) VALUES (?,?,?,?,?)").bind(body.id,kind,JSON.stringify(body),"published",new Date().toISOString())));
  for(let i=0;i<statements.length;i+=40)await db().batch(statements.slice(i,i+40));
  await db().prepare("INSERT OR IGNORE INTO metadata (key,value) VALUES (?,?)").bind("seed-v1","ready").run();
  }
  await importCourse(db());
}
export async function getContent(includeDrafts=false):Promise<Content>{await ensureSeed();const {results}=await db().prepare(includeDrafts?"SELECT kind,body,status FROM content WHERE status != 'archived' ORDER BY rowid":"SELECT kind,body,status FROM content WHERE status = 'published' ORDER BY rowid").all<{kind:Kind;body:string;status:string}>();const out:Content={branches:[],lessons:[],cards:[],questions:[],cases:[],practices:[],documents:[]};for(const r of results){(out[collection[r.kind]] as unknown[]).push({...JSON.parse(r.body),_status:r.status});}return out;}
export async function getItem(id:string,kind:Kind){const row=await db().prepare("SELECT body FROM content WHERE id = ? AND kind = ? AND status = 'published'").bind(id,kind).first<{body:string}>();return row?JSON.parse(row.body):null;}
export async function getState(userId:string,defaultName="Софья"):Promise<State>{
  const database=db();await database.prepare("INSERT OR IGNORE INTO profiles (user_id,name,goal) VALUES (?,?,?)").bind(userId,defaultName,50).run();
  const [profile,eventRows,reviewRows,bookmarkRows,totals,dayRows,completions,weakRows]=await Promise.all([
    database.prepare("SELECT name,goal FROM profiles WHERE user_id = ?").bind(userId).first<{name:string;goal:number}>(),
    database.prepare("SELECT id,kind,target_id,answer,correct,xp,day,created_at FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 500").bind(userId).all<Event>(),
    database.prepare("SELECT card_id,level,due_at,rating FROM reviews WHERE user_id = ?").bind(userId).all<Review>(),
    database.prepare("SELECT item_id FROM bookmarks WHERE user_id = ?").bind(userId).all<{item_id:string}>(),
    database.prepare("SELECT COALESCE(SUM(xp),0) xp, COUNT(CASE WHEN kind = 'question' AND correct IS NOT NULL THEN 1 END) answered, COALESCE(SUM(CASE WHEN kind = 'question' AND correct = 1 THEN 1 ELSE 0 END),0) correct FROM events WHERE user_id = ?").bind(userId).first<{xp:number;answered:number;correct:number}>(),
    database.prepare("SELECT day,SUM(xp) xp FROM events WHERE user_id = ? GROUP BY day ORDER BY day DESC").bind(userId).all<{day:string;xp:number}>(),
    database.prepare("SELECT DISTINCT kind,target_id FROM events WHERE user_id = ? AND kind IN ('lesson','case')").bind(userId).all<{kind:string;target_id:string}>(),
    database.prepare("SELECT target_id id,SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) errors FROM events e WHERE user_id = ? AND kind = 'question' AND correct IS NOT NULL GROUP BY target_id HAVING errors > 0 AND (SELECT correct FROM events e2 WHERE e2.user_id = e.user_id AND e2.kind = 'question' AND e2.target_id = e.target_id ORDER BY created_at DESC LIMIT 1) = 0 ORDER BY errors DESC").bind(userId).all<{id:string;errors:number}>(),
  ]);
  const today=moscowDay();const daySet=new Set(dayRows.results.map(d=>d.day));let streak=0;let pointer=new Date(today+"T12:00:00Z");if(!daySet.has(today))pointer.setUTCDate(pointer.getUTCDate()-1);while(daySet.has(moscowDay(pointer))){streak++;pointer.setUTCDate(pointer.getUTCDate()-1);}
  const assessments=await database.prepare("SELECT mode,branch_id branchId,target,MAX(json_extract(result,'$.passed')) passed,MAX(json_extract(result,'$.percent')) bestPercent,COUNT(*) attempts FROM assessment_attempts WHERE user_id=? AND status='finished' GROUP BY mode,branch_id,target").bind(userId).all<{mode:"topic"|"section";branchId:string;target:string;passed:number;bestPercent:number;attempts:number}>();
  return {assessments:assessments.results.map(a=>({...a,passed:!!a.passed})),name:profile!.name,goal:profile!.goal,xp:totals!.xp,todayXp:dayRows.results.find(d=>d.day===today)?.xp||0,streak,questionsAnswered:totals!.answered,correctAnswers:totals!.correct,accuracy:totals!.answered?Math.round(totals!.correct/totals!.answered*100):0,completedLessons:completions.results.filter(e=>e.kind==="lesson").map(e=>e.target_id),completedCases:completions.results.filter(e=>e.kind==="case").map(e=>e.target_id),events:eventRows.results,reviews:reviewRows.results,bookmarks:bookmarkRows.results.map(b=>b.item_id),days:dayRows.results,today,weak:weakRows.results};
}

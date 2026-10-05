import curriculum from "@/content/curriculum.json";
import {z} from 'zod';
import {getAuthUser} from '@/lib/auth';
import {db,getContent,getState,moscowDay} from '@/lib/civilist-db';
import {grade,publicQuestion,selectQuestions,targetKey,validAnswer,PASS_PERCENT,type Mode} from '@/lib/assessment';
import type {Question} from '@/lib/civilist-types';
type Row={id:string;user_id:string;target_key:string;mode:Mode;branch_id:string;target:string;title:string;questions:string;answers:string;result:string|null;status:string;created_at:string;updated_at:string};
const start=z.object({action:z.literal('start'),mode:z.enum(['topic','section']),branchId:z.string().max(100),target:z.string().min(1).max(250)});
const save=z.object({action:z.enum(['save','finish']),id:z.string().uuid(),answers:z.record(z.union([z.string().max(5000),z.array(z.number().int()).max(12)])).refine(a=>Object.keys(a).length<=200)});
function present(row:Row){return{id:row.id,mode:row.mode,branchId:row.branch_id,target:row.target,title:row.title,status:row.status,questions:JSON.parse(row.questions).map(publicQuestion),answers:JSON.parse(row.answers),result:row.result?JSON.parse(row.result):null,passPercent:PASS_PERCENT};}
export async function GET(request:Request){
 const user=await getAuthUser();if(!user)return Response.json({error:'Войди в приложение.'},{status:401});
 const id=new URL(request.url).searchParams.get('id');
 const row=await db().prepare('SELECT * FROM assessment_attempts WHERE id=? AND user_id=?').bind(id,user.userId).first<Row>();
 return row?Response.json(present(row)):Response.json({error:'Попытка не найдена.'},{status:404});
}
export async function POST(request:Request){
 const user=await getAuthUser();if(!user)return Response.json({error:'Войди в приложение.'},{status:401});
 try{
  const raw=await request.text();if(raw.length>1100000)return Response.json({error:'Ответ слишком большой.'},{status:413});
  const a=z.union([start,save]).parse(JSON.parse(raw));const now=new Date().toISOString();
  if(a.action==='start'){
   const c=await getContent();const lessons=c.lessons.filter(l=>l.branchId===a.branchId&&(a.mode==='topic'?l.id===a.target:l.topic===a.target));
   const key=targetKey(a.mode,a.branchId,a.target);
   const questions=selectQuestions(a.mode,lessons,c.questions);
   if(a.mode==='section'){
    const planned=curriculum.sections.find(s=>s.branchId===a.branchId&&s.title===a.target);
    if(planned?.topics.some(t=>!lessons.some(l=>l.id===t.id)))return Response.json({error:'Раздел ещё наполняется. Итоговый тест откроется после подготовки всех тем.'},{status:409});
    const state=await getState(user.userId);const {results}=await db().prepare("SELECT target FROM assessment_attempts WHERE user_id=? AND branch_id=? AND mode='topic' AND status='finished' AND json_extract(result,'$.passed')=1").bind(user.userId,a.branchId).all<{target:string}>();
    const passed=new Set(results.map(r=>r.target));
    if(lessons.some(l=>!state.completedLessons.includes(l.id)||!passed.has(l.id)))return Response.json({error:'Сначала прочитай все темы раздела и сдай их тесты.'},{status:409});
   }
   await db().prepare("INSERT OR IGNORE INTO assessment_attempts (id,user_id,target_key,mode,branch_id,target,title,questions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.userId,key,a.mode,a.branchId,a.target,a.mode==='topic'?lessons[0].title:a.target,JSON.stringify(questions),now,now).run();
   const row=await db().prepare("SELECT * FROM assessment_attempts WHERE user_id=? AND target_key=? AND status='active'").bind(user.userId,key).first<Row>();
   return Response.json(present(row!));
  }
  const row=await db().prepare('SELECT * FROM assessment_attempts WHERE id=? AND user_id=?').bind(a.id,user.userId).first<Row>();
  if(!row)return Response.json({error:'Попытка не найдена.'},{status:404});
  if(row.status==='finished')return Response.json({...present(row),state:await getState(user.userId),replayed:true});
  const questions=JSON.parse(row.questions) as Question[];
  if(Object.entries(a.answers).some(([id,value])=>{const q=questions.find(q=>q.id===id);return !q||!validAnswer(q,value,false);}))return Response.json({error:'Проверь формат ответов.'},{status:400});
  if(a.action==='save'){
   await db().prepare("UPDATE assessment_attempts SET answers=?,updated_at=? WHERE id=? AND user_id=? AND status='active'").bind(JSON.stringify(a.answers),now,a.id,user.userId).run();
  }else{
   const result=grade(questions,a.answers);
   // Both operations are in one transaction. Only the first finish supplies the stored result.
   // The award reads that result, never the potentially competing request's answers.
   const statements=[
    db().prepare("UPDATE assessment_attempts SET answers=?,result=?,status='finished',updated_at=? WHERE id=? AND user_id=? AND status='active'").bind(JSON.stringify(a.answers),JSON.stringify(result),now,a.id,user.userId),
    db().prepare("INSERT OR IGNORE INTO events (id,user_id,kind,target_id,answer,correct,xp,day,created_at) SELECT id,user_id,'assessment',target_key,result,json_extract(result,'$.passed'),CASE WHEN json_extract(result,'$.passed')=1 AND NOT EXISTS (SELECT 1 FROM events WHERE user_id=? AND kind='assessment' AND target_id=? AND xp>0) THEN ? ELSE 0 END,?,? FROM assessment_attempts WHERE id=? AND user_id=? AND status='finished'").bind(user.userId,row.target_key,row.mode==='section'?30:10,moscowDay(),now,a.id,user.userId),
   ];
   for(const [i,q] of questions.entries())statements.push(db().prepare("INSERT OR IGNORE INTO events (id,user_id,kind,target_id,answer,correct,xp,day,created_at) SELECT id||?,user_id,'question',?,json_object('value',json_extract(answers,?),'feedback',json_extract(result,?)),json_extract(result,?),0,?,updated_at FROM assessment_attempts WHERE id=? AND user_id=? AND status='finished'").bind(':'+q.id,q.id,'$."'+q.id+'"',`$.feedback[${i}].explanation`,`$.feedback[${i}].correct`,moscowDay(),a.id,user.userId));
   await db().batch(statements);
  }
  const updated=await db().prepare('SELECT * FROM assessment_attempts WHERE id=? AND user_id=?').bind(a.id,user.userId).first<Row>();
  return Response.json({...present(updated!),state:a.action==='finish'?await getState(user.userId):undefined});
 }catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Проверь заполнение ответа.'},{status:400});if(e instanceof Error&&/задани|тем|раздел/.test(e.message))return Response.json({error:e.message},{status:400});console.error('Assessment failed',e);return Response.json({error:'Не удалось сохранить попытку. Повтори запрос.'},{status:503});}
}

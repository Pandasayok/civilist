import {getChatGPTUser} from "@/app/chatgpt-auth";
import {db,getItem,getState,moscowDay} from "@/lib/civilist-db";
import {z} from "zod";
import type {Question,CaseStudy,Card} from "@/lib/civilist-types";
export const dynamic="force-dynamic";
class BadAnswer extends Error {}
const input=z.object({id:z.string().uuid(),kind:z.enum(["card","question","lesson","case"]),targetId:z.string().max(100),answer:z.unknown(),role:z.string().max(100).optional()});
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"Войди через ChatGPT, чтобы сохранить прогресс."},{status:401});
  if(request.headers.get("origin")&&new URL(request.url).origin!==request.headers.get("origin"))return Response.json({error:"Недопустимый запрос"},{status:403});
  try{
    const a=input.parse(await request.json());const existing=await db().prepare("SELECT user_id,answer,correct,xp FROM events WHERE id = ?").bind(a.id).first<{user_id:string;answer:string;correct:number|null;xp:number}>();if(existing){if(existing.user_id!==user.userId)return Response.json({error:"Конфликт события"},{status:409});const saved=JSON.parse(existing.answer);return Response.json({state:await getState(user.userId),correct:existing.correct===null?null:!!existing.correct,xp:existing.xp,feedback:saved.feedback,score:saved.score,total:saved.total,replayed:true});}
    const item=await getItem(a.targetId,a.kind);if(!item)return Response.json({error:"Материал больше недоступен."},{status:404});
    let correct:number|null=null,xp=0,feedback="",score=0,total=0;const day=moscowDay(),now=new Date();let review:null|{level:number;dueAt:string;rating:string}=null;
    if(a.kind==="card"){
      const rating=z.enum(["again","hard","good"]).parse(a.answer);const previous=await db().prepare("SELECT level FROM reviews WHERE user_id = ? AND card_id = ?").bind(user.userId,a.targetId).first<{level:number}>();const level=rating==="again"?0:rating==="hard"?Math.max(0,(previous?.level||0)-1):Math.min(5,(previous?.level||0)+1);const delay=rating==="again"?10*60000:rating==="hard"?86400000:[1,3,7,14,30,60][level]*86400000;review={level,dueAt:new Date(now.getTime()+delay).toISOString(),rating};xp=1;feedback=rating==="again"?"Повторим через 10 минут.":rating==="hard"?"Вернёмся к карточке завтра.":`Следующее повторение через ${Math.round(delay/86400000)} дн.`;
    }
    if(a.kind==="question"){
      const q=item as Question;feedback=q.explanation;
      if(q.type==="short"){z.string().trim().min(1).max(5000).parse(a.answer);xp=1;}
      else {const selected=z.array(z.number().int().nonnegative()).max(12).parse(a.answer);if(selected.some(i=>i>=q.options.length)||new Set(selected).size!==selected.length)throw new BadAnswer("Invalid answer");const orderSensitive=q.type==="matching"||q.type==="sequence";const expected=orderSensitive?q.answer:[...q.answer].sort((a,b)=>a-b),actual=orderSensitive?selected:[...selected].sort((a,b)=>a-b);correct=JSON.stringify(actual)===JSON.stringify(expected)?1:0;xp=correct?2:0;}
    }
    if(a.kind==="lesson")xp=10;
    if(a.kind==="case"){
      const game=item as CaseStudy;const path=game.paths.find(p=>p.id===a.role);if(!path)throw new BadAnswer("Unknown role");const answers=z.array(z.object({nodeId:z.string(),answer:z.number().int().nonnegative()})).min(1).max(40).parse(a.answer);let current:string|undefined=path.start;for(const answer of answers){if(answer.nodeId!==current)throw new BadAnswer("Incorrect path");const node=path.nodes.find(n=>n.id===current);const option=node?.options[answer.answer];if(!node||!option)throw new BadAnswer("Unknown choice");score+=option.correct?1:0;total++;const next=option.next||node.next;current=next==="end"?undefined:next;}if(current)throw new BadAnswer("Case incomplete");correct=score/total>=.7?1:0;xp=25;feedback=correct?game.success:game.failure;
    }
    const rewardScope=a.kind==="lesson"||a.kind==="case"?"":" AND day = ?";
    const query=db().prepare("SELECT id FROM events WHERE user_id = ? AND kind = ? AND target_id = ? AND xp > 0"+rewardScope+" LIMIT 1");const prior=await (rewardScope?query.bind(user.userId,a.kind,a.targetId,day):query.bind(user.userId,a.kind,a.targetId)).first();if(prior)xp=0;
    const statements=[db().prepare("INSERT INTO events (id,user_id,kind,target_id,answer,correct,xp,day,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(a.id,user.userId,a.kind,a.targetId,JSON.stringify({value:a.answer,role:a.role,score,total,feedback}),correct,xp,day,now.toISOString())];
    if(review)statements.push(db().prepare("INSERT INTO reviews (user_id,card_id,level,due_at,rating) VALUES (?,?,?,?,?) ON CONFLICT (user_id,card_id) DO UPDATE SET level=excluded.level,due_at=excluded.due_at,rating=excluded.rating").bind(user.userId,a.targetId,review.level,review.dueAt,review.rating));
    await db().batch(statements);return Response.json({state:await getState(user.userId),correct:correct===null?null:!!correct,xp,feedback,score,total});
  }catch(e){console.error("activity failed",e);return Response.json({error:e instanceof z.ZodError||e instanceof BadAnswer?"Проверь заполнение ответа.":"Не удалось сохранить результат. Ответ остаётся на экране — попробуй ещё раз."},{status:e instanceof z.ZodError||e instanceof BadAnswer?400:503});}
}

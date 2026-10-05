import type {Lesson, Question} from './civilist-types.ts';
export const TOPIC_SIZE=10;
export const FINAL_SIZE=20;
export const PASS_PERCENT=80;
export type Mode='topic'|'section';
export type Answer=number[]|string;
export type AssessmentResult={score:number;total:number;percent:number;passed:boolean;written:number;feedback:{id:string;correct:boolean|null;answer:number[];model?:string;explanation:string;norms:string}[]};
export function targetKey(mode:Mode,branch:string,target:string){return JSON.stringify([mode,branch,target]);}
export function shuffled<T>(items:T[],random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function selectQuestions(mode:Mode,lessons:Lesson[],bank:Question[],random?:()=>number):Question[]{
  if(!lessons.length)throw new Error('В разделе пока нет опубликованных тем.');
  const pools=lessons.map(l=>shuffled(bank.filter(q=>q.lessonId===l.id&&q.branchId===l.branchId&&(mode==='topic'||q.type!=='short')),random));
  if(mode==='topic'){
    if(lessons.length!==1||pools[0].length<TOPIC_SIZE)throw new Error('Для зачёта темы нужно не менее 10 заданий.');
    if(pools[0].filter(q=>q.type!=='short').length<8)throw new Error('Для зачёта темы нужно не менее 8 проверяемых заданий.');
    const graded=pools[0].filter(q=>q.type!=='short').slice(0,8);
    return shuffled([...graded,...pools[0].filter(q=>!graded.includes(q)).slice(0,2)],random);
  }
  if(pools.some(p=>!p.length))throw new Error('Для каждой темы нужны проверяемые задания.');
  if(pools.reduce((n,p)=>n+p.length,0)<FINAL_SIZE)throw new Error('Для итогового теста нужно не менее 20 проверяемых заданий.');
  // Round robin covers every topic before taking another question from a topic.
  const out:Question[]=[];const limit=Math.max(FINAL_SIZE,lessons.length);
  for(let i=0;out.length<limit;i++)for(const pool of pools){if(pool[i])out.push(pool[i]);if(out.length===limit)break;}
  return shuffled(out,random);
}
export function validAnswer(q:Question,value:unknown,complete=true):value is Answer {
  if(q.type==='short')return typeof value==='string'&&value.length<=5000&&(!complete||value.trim().length>0);
  if(!Array.isArray(value)||value.length>12||value.some(i=>!Number.isInteger(i)||(i<0&&(complete||q.type!=="matching"||i!==-1))||i>=q.options.length)||new Set(value.filter(i=>i>=0)).size!==value.filter(i=>i>=0).length)return false;
  if(!complete)return true;
  if(q.type==='single')return value.length===1;
  if(q.type==='multiple')return value.length>0;
  return value.length===q.options.length;
}
export function grade(questions:Question[],answers:Record<string,unknown>):AssessmentResult{
  if(Object.keys(answers).length!==questions.length||questions.some(q=>!validAnswer(q,answers[q.id])))throw new Error('Ответь на все задания.');
  const feedback=questions.map(q=>{
    const a=answers[q.id] as Answer;
    const ordered=q.type==='matching'||q.type==='sequence';
    const correct=q.type==='short'?null:JSON.stringify(ordered?a:[...(a as number[])].sort((a,b)=>a-b))===JSON.stringify(ordered?q.answer:[...q.answer].sort((a,b)=>a-b));
    return{id:q.id,correct,answer:q.answer,model:q.model,explanation:q.explanation,norms:q.source.label};
  });
  const total=feedback.filter(f=>f.correct!==null).length,score=feedback.filter(f=>f.correct).length;
  return{score,total,percent:total?Math.round(score/total*100):0,passed:total>0&&score*100>=total*PASS_PERCENT,written:questions.length-total,feedback};
}
export function publicQuestion(q:Question){const {answer,model,explanation,...publicFields}=q;return publicFields;}

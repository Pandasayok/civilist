import {z} from "zod";
import type {Kind} from "./civilist-types";
const str=z.string().trim().min(1).max(25000);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const source=z.object({label:str,url:z.string().url().refine(v=>v.startsWith("https://"),"Нужна ссылка https://"),checkedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)});
const common={id,title:str};
const node=z.object({id,scene:str,title:str,options:z.array(z.object({text:str,feedback:str,correct:z.boolean(),next:id.optional()})).min(2).max(6),next:id.optional(),source});
export const schemas={
  branch:z.object({...common,description:str,group:str,icon:str,color:z.string().regex(/^#[a-fA-F0-9]{6}$/)}),
  lesson:z.object({...common,branchId:id,topic:str,minutes:z.number().int().min(1).max(180),summary:str,points:z.array(str).min(1).max(20),example:str,source}),
  card:z.object({...common,branchId:id,lessonId:id,answer:str,source}),
  question:z.object({...common,branchId:id,lessonId:id,type:z.enum(["single","multiple","matching","sequence","short"]),options:z.array(str).max(12),answer:z.array(z.number().int().min(0)).max(12),left:z.array(str).optional(),explanation:str,model:str.optional(),source}).superRefine((q,c)=>{
    if(q.type==="short"){if(!q.model)c.addIssue({code:"custom",message:"Нужен эталонный ответ"});return;}
    if(q.options.length<2||q.answer.length===0||q.answer.some(i=>i>=q.options.length))c.addIssue({code:"custom",message:"Проверь варианты и правильный ответ"});
    if(q.type==="single"&&q.answer.length!==1)c.addIssue({code:"custom",message:"Выбери один правильный ответ"});
    if((q.type==="matching"||q.type==="sequence")&&(q.answer.length!==q.options.length||new Set(q.answer).size!==q.answer.length))c.addIssue({code:"custom",message:"Нужна полная последовательность или соответствия"});
    if(q.type==="matching"&&q.left?.length!==q.options.length)c.addIssue({code:"custom",message:"Проверь левую колонку"});
  }),
  case:z.object({...common,branchId:id,summary:str,scenario:str,minutes:z.number().int().min(1).max(180),tags:z.array(str),paths:z.array(z.object({id,label:str,start:id,nodes:z.array(node).min(1).max(30)})).min(1).max(3),success:str,failure:str,source}).superRefine((v,c)=>{for(const p of v.paths){const map=new Map(p.nodes.map(n=>[n.id,n]));if(map.size!==p.nodes.length||!map.has(p.start)){c.addIssue({code:"custom",message:"Проверь этапы дела"});continue;}function visit(key:string,seen:Set<string>):boolean{if(seen.has(key)||!map.has(key))return false;const n=map.get(key)!;const nextSeen=new Set([...seen,key]);return n.options.every(o=>{const next=o.next||n.next;return !next||next==="end"||visit(next,nextSeen);});}if(!visit(p.start,new Set()))c.addIssue({code:"custom",message:"В деле есть цикл или ссылка на отсутствующий этап"});}}),
  practice:z.object({...common,category:str,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),number:str,summary:str,decision:str,importance:str,norms:str,source}),
  document:z.object({...common,category:str,summary:str,checks:z.array(str).min(1),risks:z.array(str).min(1),body:str,source}),
};
export function validateContent(kind:Kind,body:unknown){return schemas[kind].parse(body);}

// Run against the LOCAL Worker after build, db:local and preview. Never production.
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
const target=new URL(process.env.CIVILIST_TEST_BASE_URL||"http://localhost:8787");
if(target.protocol!=="http:"||!["localhost","127.0.0.1"].includes(target.hostname)||target.username||target.password||target.pathname!=="/"||target.search||target.hash){
  throw new Error("API tests may only use a local HTTP Worker. Never QA or production.");
}
const base=target.origin;
const credentials=process.env.CIVILIST_TEST_CREDENTIALS_DIR||".";
const codes=(await readFile(resolve(credentials,".civilist-access-local.txt"),"utf8")).trim().split("\n");
const code=role=>codes.find(line=>line.includes(`(${role})`)).split(": ")[1];
const secrets=Object.fromEntries((await readFile(resolve(credentials,".dev.vars"),"utf8")).trim().split("\n").map(line=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^'|'$/g,'')];}));
let checks=0;
async function call(path,{method="GET",body,cookie,origin=base,token,status=200}={}){
  const headers={};if(body!==undefined)headers["Content-Type"]="application/json";
  if(cookie)headers.Cookie=cookie;if(origin!==null)headers.Origin=origin;
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,status,`${method} ${path} status`);checks++;
  return {response,data:await response.json()};
}
async function signIn(role){const {response}=await call("/api/auth/login",{method:"POST",body:{code:code(role)}});return response.headers.get("Set-Cookie").split(";")[0];}

await call("/api/bootstrap",{status:401});
await call("/api/editorial",{status:401});
await call("/api/auth/login",{method:"POST",body:{code:code("learner")},origin:"https://other.example",status:403});
await call("/api/auth/login",{method:"POST",body:{code:"test-only-invalid-access-code"},status:401});
const learner=await signIn("learner"),owner=await signIn("admin");
const initial=(await call("/api/bootstrap",{cookie:learner})).data;
assert.equal(initial.user.isAdmin,false);assert.equal(initial.content.lessons.length,17);checks+=2;
const adminInitial=(await call("/api/bootstrap",{cookie:owner})).data;assert.equal(adminInitial.user.isAdmin,true);checks++;
await call("/api/admin",{cookie:learner,status:403});
await call("/api/editorial",{cookie:learner,status:403});
await call("/api/admin",{cookie:owner});
await call("/api/profile",{method:"POST",cookie:learner,body:{name:"Локальный ученик",goal:50},origin:null,status:403});
await call("/api/profile",{method:"POST",cookie:learner,body:{name:"Локальный ученик",goal:50},origin:"https://other.example",status:403});
await call("/api/profile",{method:"POST",cookie:learner,body:{name:"Локальный ученик",goal:60}});
const sameAccount=await signIn("learner");assert.equal((await call("/api/bootstrap",{cookie:sameAccount})).data.state.goal,60);checks++;
assert.equal((await call("/api/bootstrap",{cookie:owner})).data.state.goal,adminInitial.state.goal);checks++;
const q=initial.content.questions.find(question=>question.type==="single");
const event={id:randomUUID(),kind:"question",targetId:q.id,answer:q.answer};
const first=(await call("/api/activity",{method:"POST",cookie:learner,body:event})).data;
assert.equal(first.correct,true);checks++;
const retry=(await call("/api/activity",{method:"POST",cookie:learner,body:event})).data;
assert.equal(retry.replayed,true);assert.equal(retry.state.xp,first.state.xp);checks+=2;
assert.equal((await call("/api/bootstrap",{cookie:sameAccount})).data.state.xp,first.state.xp);checks++;
assert.equal((await call("/api/bootstrap",{cookie:owner})).data.state.xp,adminInitial.state.xp);checks++;
await call("/api/activity",{method:"POST",cookie:owner,body:event,status:409});
await call("/api/activity",{method:"POST",cookie:learner,body:{...event,id:randomUUID(),answer:[999]},status:400});
const practice=initial.content.practices[0];
await call("/api/bookmark",{method:"POST",cookie:learner,body:{itemId:practice.id,saved:true}});
assert.ok((await call("/api/bootstrap",{cookie:sameAccount})).data.state.bookmarks.includes(practice.id));checks++;
// An editorial token cannot authenticate a learner or administrator API.
const token=secrets.CIVILIST_EDITORIAL_TOKEN;
await call("/api/bootstrap",{token,status:401});
await call("/api/admin",{token,status:401});
await call("/api/editorial",{token});
const entry={...practice,id:"smoke-editorial-draft",title:"Локальный тест черновика",source:{...practice.source,url:"https://www.vsrf.ru/smoke-test-local-only"}};
const saved=(await call("/api/editorial",{method:"POST",token,origin:null,body:{entries:[entry]}})).data;
assert.equal(saved.published,false);checks++;
const editorial=(await call("/api/editorial",{token})).data.materials.find(item=>item.id===entry.id);
assert.equal(editorial.status,"draft");checks++;
assert.ok(!(await call("/api/bootstrap",{cookie:learner})).data.content.practices.some(item=>item.id===entry.id));checks++;
const staticPage=await fetch(base+"/login");assert.equal(staticPage.status,200);assert.match(await staticPage.text(),/lang="ru"/);checks+=2;
// Assessment lifecycle: real storage, server grading, ownership and concurrent finish.
const contracts=initial.content.lessons.filter(l=>l.topic==="Договорное право");
assert.equal(contracts.length,6);
for(const l of contracts)assert.equal(initial.content.questions.filter(q=>q.lessonId===l.id).length,10);
const lookup=new Map(initial.content.questions.map(q=>[q.id,q]));
const startAttempt=(target,mode="topic",cookie=learner)=>call("/api/assessment",{method:"POST",cookie,body:{action:"start",mode,branchId:"civil",target}});
const answersFor=a=>Object.fromEntries(a.questions.map(q=>{const full=lookup.get(q.id);return[q.id,full.type==="short"?"Мой развёрнутый ответ":full.answer];}));
await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"start",mode:"section",branchId:"civil",target:"Договорное право"},status:409});
let completedAttempt;
for(const lesson of contracts){
 await call("/api/activity",{method:"POST",cookie:learner,body:{id:randomUUID(),kind:"lesson",targetId:lesson.id,answer:true}});
 const attempt=(await startAttempt(lesson.id)).data;
 assert.equal(attempt.questions.length,10);assert.ok(attempt.questions.every(q=>!('answer' in q)&&!('explanation' in q)&&!('model' in q)));
 const resumed=(await startAttempt(lesson.id)).data;assert.equal(resumed.id,attempt.id);
 await call("/api/assessment?id="+attempt.id,{cookie:owner,status:404});
 await call("/api/assessment",{method:"POST",cookie:owner,body:{action:"finish",id:attempt.id,answers:{}},status:404});
 await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"finish",id:attempt.id,answers:{}},status:400});
 const answers=answersFor(attempt);
 await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"save",id:attempt.id,answers}});
 const stored=(await call("/api/assessment?id="+attempt.id,{cookie:sameAccount})).data;assert.deepEqual(stored.answers,answers);
 const finished=(await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"finish",id:attempt.id,answers}})).data;
 assert.equal(finished.result.passed,true);assert.equal(finished.result.total,9);assert.equal(finished.result.written,1);
 const retried=(await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"finish",id:attempt.id,answers:{}}})).data;
 assert.equal(retried.state.xp,finished.state.xp);assert.deepEqual(retried.result,finished.result);completedAttempt=finished;
}
const exam=(await startAttempt("Договорное право","section")).data;
assert.equal(exam.questions.length,20);assert.equal(new Set(exam.questions.map(q=>q.lessonId)).size,6);assert.ok(exam.questions.every(q=>q.type!=="short"));
const request={method:"POST",cookie:learner,body:{action:"finish",id:exam.id,answers:answersFor(exam)}};
const [finishA,finishB]=await Promise.all([call("/api/assessment",request),call("/api/assessment",request)]);
assert.deepEqual(finishA.data.result,finishB.data.result);assert.equal(finishA.data.state.xp,completedAttempt.state.xp+30);assert.equal(finishB.data.state.xp,finishA.data.state.xp);
const repeat=(await startAttempt("Договорное право","section")).data;
assert.notEqual(repeat.id,exam.id);
const second=(await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"finish",id:repeat.id,answers:answersFor(repeat)}})).data;
assert.equal(second.state.xp,finishA.data.state.xp);assert.ok(second.state.assessments.some(a=>a.mode==="section"&&a.target==="Договорное право"&&a.passed&&a.attempts===2));
// Failed retake keeps the historical pass and does not earn XP.
const failed=(await startAttempt("contract-basics")).data;
const incorrect=Object.fromEntries(failed.questions.map(q=>{const full=lookup.get(q.id);return[q.id,q.type==="short"?"Ответ":[(full.answer[0]+1)%q.options.length]];}));
for(const q of failed.questions){if(q.type==="matching"||q.type==="sequence"){const full=lookup.get(q.id);incorrect[q.id]=[...full.answer].reverse();}}
const failedResult=(await call("/api/assessment",{method:"POST",cookie:learner,body:{action:"finish",id:failed.id,answers:incorrect}})).data;
assert.equal(failedResult.result.passed,false);assert.equal(failedResult.state.xp,second.state.xp);
assert.ok(failedResult.state.assessments.find(a=>a.target==="contract-basics").passed);
checks+=31;
await call("/api/auth/logout",{method:"POST",cookie:learner,body:{}});
await call("/api/bootstrap",{status:401});
console.log(`Local Worker + D1: ${checks} checks passed.`);

// Run against the LOCAL Worker after build, db:local and preview. Never production.
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://localhost:8787";
const codes=(await readFile(".civilist-access-local.txt","utf8")).trim().split("\n");
const code=role=>codes.find(line=>line.includes(`(${role})`)).split(": ")[1];
const secrets=Object.fromEntries((await readFile(".dev.vars","utf8")).trim().split("\n").map(line=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^'|'$/g,'')];}));
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
assert.equal(initial.user.isAdmin,false);assert.equal(initial.content.lessons.length,12);checks+=2;
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
await call("/api/auth/logout",{method:"POST",cookie:learner,body:{}});
await call("/api/bootstrap",{status:401});
console.log(`Local Worker + D1: ${checks} checks passed.`);

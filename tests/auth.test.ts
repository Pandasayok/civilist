import {test} from "node:test";
import assert from "node:assert/strict";
import {authenticate,login,logout,hashCode,runWithUser,getAuthUser,type AuthConfig} from "../lib/auth.ts";

const learnerCode="test-only-learner-access-code-with-entropy";
const adminCode="test-only-admin-access-code-with-entropy";
async function config():Promise<AuthConfig>{return {
  CIVILIST_SESSION_SECRET:"test-only-signing-secret-at-least-32-characters",
  CIVILIST_ACCOUNTS:JSON.stringify([
    {id:"learner",name:"Ученик",role:"learner",codeHash:await hashCode(learnerCode)},
    {id:"owner",name:"Владелец",role:"admin",codeHash:await hashCode(adminCode)},
  ]),
};}
function request(cookie?:string){return new Request("https://example.com/api/bootstrap",{headers:cookie?{Cookie:cookie}:{}});}
async function signed(code:string,settings:AuthConfig){
  const response=await login(new Request("https://example.com/api/auth/login",{method:"POST",body:JSON.stringify({code,role:"admin"})}),settings);
  assert.equal(response.status,200);
  const header=response.headers.get("Set-Cookie")!;
  assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=Strict/);
  return header.split(";")[0];
}
test("login uses the configured role and stable account id",async()=>{
  const settings=await config();
  const learner=await authenticate(request(await signed(learnerCode,settings)),settings);
  assert.equal(learner?.userId,"learner");assert.equal(learner?.isAdmin,false);
  const owner=await authenticate(request(await signed(adminCode,settings)),settings);
  assert.equal(owner?.userId,"owner");assert.equal(owner?.isAdmin,true);
});
test("a wrong access code is rejected",async()=>{
  const response=await login(new Request("https://example.com/api/auth/login",{method:"POST",body:JSON.stringify({code:"test-only-incorrect-access-code"})}),await config());
  assert.equal(response.status,401);assert.equal(response.headers.get("Set-Cookie"),null);
});
test("old Sites identity headers do not grant access",async()=>{
  assert.equal(await authenticate(new Request("https://example.com/api/bootstrap",{headers:{"oai-authenticated-user-id":"owner","oai-authenticated-user-email":"owner@example.com"}}),await config()),null);
});
test("modified and malformed sessions are rejected",async()=>{
  const settings=await config();const cookie=await signed(learnerCode,settings);
  const [prefix,signature]=cookie.split(".");
  const changed=prefix.slice(0,-1)+(prefix.endsWith("A")?"B":"A")+"."+signature;
  assert.equal(await authenticate(request(changed),settings),null);
  assert.equal(await authenticate(request("civilist_session=malformed"),settings),null);
  assert.equal(await authenticate(request("civilist_session=a.b.c"),settings),null);
});
test("code rotation revokes old sessions without changing the account id",async()=>{
  const settings=await config();const cookie=await signed(learnerCode,settings);
  const accounts=JSON.parse(settings.CIVILIST_ACCOUNTS!);accounts[0].codeHash=await hashCode("new-test-only-learner-code-for-rotation");
  settings.CIVILIST_ACCOUNTS=JSON.stringify(accounts);
  assert.equal(await authenticate(request(cookie),settings),null);
  assert.equal(accounts[0].id,"learner");
});
test("expired sessions are rejected",async(context)=>{
  const settings=await config();const cookie=await signed(learnerCode,settings);const later=Date.now()+8*86400000;
  context.mock.method(Date,"now",()=>later);
  assert.equal(await authenticate(request(cookie),settings),null);
});
test("missing credentials fail closed",async()=>{
  await assert.rejects(authenticate(request(),{}));
});
test("concurrent requests keep their own authenticated user",async()=>{
  const learner={userId:"learner",displayName:"Ученик",email:null,isAdmin:false};
  const owner={userId:"owner",displayName:"Владелец",email:null,isAdmin:true};
  const ids=await Promise.all([learner,owner].map(user=>runWithUser(user,async()=>{await Promise.resolve();return (await getAuthUser())?.userId;})));
  assert.deepEqual(ids,["learner","owner"]);assert.equal(await getAuthUser(),null);
});
test("logout clears the secure session cookie",()=>{
  const response=logout();assert.match(response.headers.get("Set-Cookie")!,/Max-Age=0/);
});

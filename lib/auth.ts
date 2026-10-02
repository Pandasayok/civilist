import {AsyncLocalStorage} from "node:async_hooks";

export type AuthUser={userId:string;displayName:string;email:null;isAdmin:boolean};
export type Account={id:string;name:string;role:"admin"|"learner";codeHash:string};
export type AuthConfig={CIVILIST_ACCOUNTS?:string;CIVILIST_SESSION_SECRET?:string};
const currentUser=new AsyncLocalStorage<AuthUser|null>();
const cookieName="civilist_session";
const sessionSeconds=7*24*60*60;
const encoder=new TextEncoder();

export function runWithUser<T>(user:AuthUser|null,callback:()=>T):T{return currentUser.run(user,callback);}
export async function getAuthUser():Promise<AuthUser|null>{return currentUser.getStore()||null;}
function accounts(config:AuthConfig):Account[]{
  if(!config.CIVILIST_ACCOUNTS||!config.CIVILIST_SESSION_SECRET||config.CIVILIST_SESSION_SECRET.length<32)throw new Error("Access is not configured");
  const value:unknown=JSON.parse(config.CIVILIST_ACCOUNTS);
  if(!Array.isArray(value)||!value.length||value.length>20)throw new Error("Invalid accounts configuration");
  const ids=new Set<string>();
  return value.map((account:Account)=>{
    if(!account||typeof account.id!=="string"||!/^[-a-z0-9_]{1,80}$/.test(account.id)||ids.has(account.id)||typeof account.name!=="string"||!account.name.trim()||!['admin','learner'].includes(account.role)||typeof account.codeHash!=="string"||!/^[a-f0-9]{64}$/.test(account.codeHash))throw new Error("Invalid account");
    ids.add(account.id);return account;
  });
}
function encode(value:Uint8Array){return btoa(String.fromCharCode(...value)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
function decode(value:string){return Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")),character=>character.charCodeAt(0));}
async function key(config:AuthConfig){return crypto.subtle.importKey("raw",encoder.encode(config.CIVILIST_SESSION_SECRET!),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
export async function hashCode(code:string){const digest=await crypto.subtle.digest("SHA-256",encoder.encode(code));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function user(account:Account):AuthUser{return {userId:account.id,displayName:account.name,email:null,isAdmin:account.role==="admin"};}
export async function authenticate(request:Request,config:AuthConfig):Promise<AuthUser|null>{
  const allowed=accounts(config);
  const token=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith(cookieName+"="))?.slice(cookieName.length+1);
  if(!token||token.length>2048)return null;
  try{
    const parts=token.split(".");if(parts.length!==2)return null;
    const [payload,signature]=parts;
    if(!await crypto.subtle.verify("HMAC",await key(config),decode(signature),encoder.encode(payload)))return null;
    const session=JSON.parse(new TextDecoder().decode(decode(payload))) as {id:string;exp:number;version:string};
    if(typeof session.exp!=="number"||session.exp<=Math.floor(Date.now()/1000))return null;
    const account=allowed.find(value=>value.id===session.id&&value.codeHash===session.version);
    return account?user(account):null;
  }catch{return null;}
}
export async function login(request:Request,config:AuthConfig):Promise<Response>{
  const allowed=accounts(config);
  const body=await request.json().catch(()=>null) as {code?:unknown}|null;
  if(!body||typeof body.code!=="string"||body.code.length<20||body.code.length>100)return Response.json({error:"Проверь код доступа."},{status:400});
  const hash=await hashCode(body.code.trim());const account=allowed.find(value=>value.codeHash===hash);
  if(!account)return Response.json({error:"Код не найден. Проверь его и попробуй ещё раз."},{status:401});
  const payload=encode(encoder.encode(JSON.stringify({id:account.id,exp:Math.floor(Date.now()/1000)+sessionSeconds,version:account.codeHash})));
  const signature=encode(new Uint8Array(await crypto.subtle.sign("HMAC",await key(config),encoder.encode(payload))));
  return Response.json({ok:true},{headers:{"Set-Cookie":`${cookieName}=${payload}.${signature}; Path=/; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Strict`,"Cache-Control":"no-store"}});
}
export function logout(){return Response.json({ok:true},{headers:{"Set-Cookie":`${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,"Cache-Control":"no-store"}});}

import {randomBytes,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
const local=process.argv.includes("--local");
const definitions=[{id:"owner",name:"Дмитрий",role:"admin"},{id:"sofia",name:"Софья",role:"learner"}];
const issued=definitions.map(account=>({...account,code:randomBytes(24).toString("base64url")}));
const accounts=issued.map(({code,...account})=>({...account,codeHash:createHash("sha256").update(code).digest("hex")}));
const secrets={CIVILIST_ACCOUNTS:JSON.stringify(accounts),CIVILIST_SESSION_SECRET:randomBytes(48).toString("base64url"),CIVILIST_EDITORIAL_TOKEN:randomBytes(32).toString("base64url")};
if(local){await writeFile(".dev.vars",Object.entries(secrets).map(([name,value])=>`${name}='${value}'`).join("\n")+"\n",{flag:"wx",mode:0o600});}
else{await writeFile(".civilist-secrets.json",JSON.stringify(secrets,null,2)+"\n",{flag:"wx",mode:0o600});}
await writeFile(local?".civilist-access-local.txt":".civilist-access.txt",issued.map(({name,role,code})=>`${name} (${role}): ${code}`).join("\n")+"\n",{flag:"wx",mode:0o600});
console.log(local?"Созданы .dev.vars и .civilist-access-local.txt для локальной проверки.":"Созданы .civilist-secrets.json для Cloudflare и .civilist-access.txt с двумя кодами входа.");
console.log("Сохрани коды в менеджере паролей. Эти файлы исключены из Git. Повторный запуск не перезаписывает их.");

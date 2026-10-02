import {getChatGPTUser} from "@/app/chatgpt-auth";
import {config,getContent,getState} from "@/lib/civilist-db";
export const dynamic="force-dynamic";
export async function GET(){try{const user=await getChatGPTUser();return Response.json({content:await getContent(),state:user?await getState(user.userId):null,user:{isSignedIn:!!user,isAdmin:!!user&&user.email.toLowerCase()===config("CIVILIST_ADMIN_EMAIL").toLowerCase(),email:user?.email||null}},{headers:{"Cache-Control":"no-store"}});}catch(e){console.error("bootstrap failed",e);return Response.json({error:"Не удалось загрузить материалы. Повтори попытку."},{status:503});}}

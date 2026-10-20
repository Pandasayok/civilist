import {env} from "cloudflare:workers";
import {ensureLegacyAccount} from "@/lib/account-access";
import {getAuthUser} from "@/lib/auth";
import {getContent,getState} from "@/lib/civilist-db";
export async function GET(){try{if(!env.DB)throw new Error("DB unavailable");const user=await getAuthUser();const access=user?await ensureLegacyAccount(env.DB,user):null;return Response.json({content:await getContent(),state:user?await getState(user.userId,user.displayName):null,user:{isSignedIn:!!user,isAdmin:!!user?.isAdmin,email:user?.email||null,access}},{headers:{"Cache-Control":"no-store"}});}catch(e){console.error("bootstrap failed",e);return Response.json({error:"Не удалось загрузить материалы. Повтори попытку."},{status:503});}}

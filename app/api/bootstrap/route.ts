import {getAuthUser} from "@/lib/auth";
import {getContent,getState} from "@/lib/civilist-db";
export async function GET(){try{const user=await getAuthUser();return Response.json({content:await getContent(),state:user?await getState(user.userId,user.displayName):null,user:{isSignedIn:!!user,isAdmin:!!user?.isAdmin,email:user?.email||null}},{headers:{"Cache-Control":"no-store"}});}catch(e){console.error("bootstrap failed",e);return Response.json({error:"Не удалось загрузить материалы. Повтори попытку."},{status:503});}}

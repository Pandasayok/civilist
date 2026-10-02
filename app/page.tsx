import Civilist from "./Civilist";
import {getChatGPTUser} from "./chatgpt-auth";
import {getContent,getState,config} from "@/lib/civilist-db";
import type {Bootstrap} from "@/lib/civilist-types";
export const dynamic="force-dynamic";
export default async function Home(){let initial:Bootstrap|null=null;try{const user=await getChatGPTUser();const content=await getContent();initial={content,state:user?await getState(user.userId):null,user:{isSignedIn:!!user,isAdmin:!!user&&!!config("CIVILIST_ADMIN_EMAIL")&&user.email.toLowerCase()===config("CIVILIST_ADMIN_EMAIL").toLowerCase(),email:user?.email||null}};}catch(e){console.error("Initial load unavailable",e);}return <Civilist initial={initial}/>;}

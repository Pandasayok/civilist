import {authenticate,login,logout,runWithUser,type AuthConfig} from "../lib/auth";
import * as bootstrap from "../app/api/bootstrap/route";
import * as activity from "../app/api/activity/route";
import * as profile from "../app/api/profile/route";
import * as bookmark from "../app/api/bookmark/route";
import * as admin from "../app/api/admin/route";
import * as editorial from "../app/api/editorial/route";
type Env=AuthConfig&{DB:D1Database;ASSETS:Fetcher;CIVILIST_EDITORIAL_TOKEN?:string};
type Handler=(request:Request)=>Promise<Response>;
const routes:Record<string,Partial<Record<string,Handler>>>={
  "/api/bootstrap":bootstrap,"/api/activity":activity,"/api/profile":profile,
  "/api/bookmark":bookmark,"/api/admin":admin,"/api/editorial":editorial,
};
function finish(response:Response){
  const secured=new Response(response.body,response);
  secured.headers.set("Cache-Control","no-store");
  secured.headers.set("X-Content-Type-Options","nosniff");
  secured.headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  return secured;
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(request);
    try{
      const safe=request.method==="GET"||request.method==="HEAD";
      // The bearer service is restricted to the draft-only editorial endpoint.
      const authorization=request.headers.get("Authorization");
      const service=url.pathname==="/api/editorial"&&!!env.CIVILIST_EDITORIAL_TOKEN&&env.CIVILIST_EDITORIAL_TOKEN.length>=32&&authorization===`Bearer ${env.CIVILIST_EDITORIAL_TOKEN}`;
      if(!safe&&!service&&request.headers.get("Origin")!==url.origin)return finish(Response.json({error:"Недопустимый запрос."},{status:403}));
      if(url.pathname==="/api/auth/login")return finish(request.method==="POST"?await login(request,env):Response.json({error:"Метод недоступен."},{status:405}));
      if(url.pathname==="/api/auth/logout")return finish(request.method==="POST"?logout():Response.json({error:"Метод недоступен."},{status:405}));
      const handler=routes[url.pathname]?.[request.method];
      if(!handler)return finish(Response.json({error:"Маршрут не найден."},{status:404}));
      const user=service?{userId:"editorial-service",displayName:"Редакция",email:null,isAdmin:true}:await authenticate(request,env);
      if(!user)return finish(Response.json({error:"Войди, чтобы открыть приложение."},{status:401}));
      return finish(await runWithUser(user,()=>handler(request)));
    }catch(error){console.error("API request failed",error instanceof Error?error.message:"Unknown error");return finish(Response.json({error:"Приложение ещё не настроено или база временно недоступна."},{status:503}));}
  },
};

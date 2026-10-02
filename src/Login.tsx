import {useState, type FormEvent} from "react";
import {Scale} from "lucide-react";
import {Button} from "../components/ui/button";
import {Input} from "../components/ui/input";

export default function Login(){
  const [code,setCode]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code.trim()})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Не удалось войти.");
      window.location.replace("/");
    }catch(e){setError(e instanceof Error?e.message:"Нет связи с приложением. Попробуй ещё раз.");}
    finally{setBusy(false);}
  }
  return <main className="login-page"><section className="panel login-panel">
    <div className="brand"><Scale size={34}/><span>Civilist<small>ПРАВО В ПРАКТИКЕ</small></span></div>
    <h1>Продолжим учиться</h1>
    <p>Введи свой код доступа. На телефоне и компьютере используй один код — тогда прогресс будет общим.</p>
    <form onSubmit={event=>void submit(event)}>
      <label htmlFor="access-code">Код доступа</label>
      <Input id="access-code" type="password" autoComplete="current-password" required minLength={20} maxLength={100} value={code} onChange={event=>setCode(event.target.value)} autoFocus/>
      {error&&<p role="alert" className="login-error">{error}</p>}
      <Button type="submit" disabled={busy}>{busy?"Входим…":"Войти"}</Button>
    </form>
    <small>Доступ выдаёт владелец приложения. Регистрация пока закрыта.</small>
  </section></main>;
}

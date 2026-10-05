import curriculum from "@/content/curriculum.json";
import type {Lesson, State, Question} from "@/lib/civilist-types";
import {Button} from "@/components/ui/button";

export default function StudyOutline({lessons,state,questions,onExam,branchId,expanded,onExpand,onOpen}:{
  branchId:string;lessons:Lesson[];state:State|null;questions:Question[];onExam:(section:string)=>void;expanded:string;
  onExpand:(section:string)=>void;onOpen:(lesson:Lesson)=>void;
}) {
  const planned=curriculum.sections.filter(s=>s.branchId===branchId);
  const sections=[...new Set([...planned.map(s=>s.title),...lessons.map(l=>l.topic.trim()||"Общие положения")])];
  if(!sections.length)return <p className="panel">Темы этого направления пока готовятся.</p>;
  return <div className="study-outline" aria-label="Оглавление направления">
    {sections.map(section=>{
      const items=lessons.filter(l=>(l.topic.trim()||"Общие положения")===section);
      const plannedTopics=planned.find(s=>s.title===section)?.topics||[];
      items.sort((a,b)=>(plannedTopics.findIndex(t=>t.id===a.id)<0?999:plannedTopics.findIndex(t=>t.id===a.id))-(plannedTopics.findIndex(t=>t.id===b.id)<0?999:plannedTopics.findIndex(t=>t.id===b.id)));
      const missing=plannedTopics.filter(t=>!items.some(l=>l.id===t.id));
      const completed=items.filter(l=>state?.completedLessons.includes(l.id)).length;
      const tests=items.filter(l=>state?.assessments?.some(a=>a.mode==='topic'&&a.target===l.id&&a.passed)).length;
      const available=questions.filter(q=>items.some(l=>l.id===q.lessonId)&&q.type!=='short').length;
      const eligible=items.length>0&&missing.length===0&&completed===items.length&&tests===items.length&&available>=20;
      const result=state?.assessments?.find(a=>a.mode==='section'&&a.branchId===branchId&&a.target===section);
      const open=expanded===section;
      const index=sections.indexOf(section);
      return <section className="panel study-section" key={section}>
        <h2><button className="study-section-toggle" aria-expanded={open} aria-controls={`study-section-${index}`} onClick={()=>onExpand(open?"":section)}>
          <span>{section}<small>{completed} из {items.length} тем пройдено{missing.length>0?` · готовится ещё ${missing.length}`:""}</small></span><span aria-hidden="true">{open?"−":"+"}</span>
        </button></h2>
        <div id={`study-section-${index}`} hidden={!open}>
          {items.map(l=><article className="study-topic" key={l.id}>
            <div><span className="meta">{state?.completedLessons.includes(l.id)?"Пройдена":"Не пройдена"} · {l.minutes} минут</span><h3>{l.title}</h3><p>{l.summary}</p></div>
            <Button variant="outline" aria-label={`Открыть тему: ${l.title}`} onClick={()=>onOpen(l)}>Открыть тему</Button>
          </article>)}
          {missing.map(t=><article className="study-topic study-topic-planned" key={t.id}><div><span className="meta">Материал готовится</span><h3>{t.title}</h3></div><Button variant="outline" disabled>Пока недоступно</Button></article>)}
          <div className="study-section-exam"><h3>Итоговый тест: {section}</h3><p>Прочитано тем: {completed}/{items.length}. Сдано тестов тем: {tests}/{items.length}.</p>{result&&<p>{result.passed?'Раздел закрыт':'Раздел ещё не закрыт'} · лучший результат {result.bestPercent}% · попыток {result.attempts}</p>}<Button disabled={!eligible} onClick={()=>onExam(section)}>Пройти итоговый тест</Button>{!eligible&&<p className="meta">{missing.length>0?'Итоговый тест откроется после подготовки всех тем раздела.':available<20?'Банк итогового теста готовится: нужны 20 проверяемых заданий.':'Для доступа прочитай все темы и сдай их тесты.'}</p>}</div>
        </div>
      </section>;
    })}
  </div>;
}

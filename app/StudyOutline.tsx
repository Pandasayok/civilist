import type {Lesson, State} from "@/lib/civilist-types";
import {Button} from "@/components/ui/button";

export default function StudyOutline({lessons,state,expanded,onExpand,onOpen}:{
  lessons:Lesson[];state:State|null;expanded:string;
  onExpand:(section:string)=>void;onOpen:(lesson:Lesson)=>void;
}) {
  const sections=[...new Set(lessons.map(l=>l.topic.trim()||"Общие положения"))];
  if(!lessons.length)return <p className="panel">Темы этого направления пока готовятся.</p>;
  return <div className="study-outline" aria-label="Оглавление направления">
    {sections.map(section=>{
      const items=lessons.filter(l=>(l.topic.trim()||"Общие положения")===section);
      const completed=items.filter(l=>state?.completedLessons.includes(l.id)).length;
      const open=expanded===section;
      const index=sections.indexOf(section);
      return <section className="panel study-section" key={section}>
        <h2><button className="study-section-toggle" aria-expanded={open} aria-controls={`study-section-${index}`} onClick={()=>onExpand(open?"":section)}>
          <span>{section}<small>{completed} из {items.length} тем пройдено</small></span><span aria-hidden="true">{open?"−":"+"}</span>
        </button></h2>
        <div id={`study-section-${index}`} hidden={!open}>
          {items.map(l=><article className="study-topic" key={l.id}>
            <div><span className="meta">{state?.completedLessons.includes(l.id)?"Пройдена":"Не пройдена"} · {l.minutes} минут</span><h3>{l.title}</h3><p>{l.summary}</p></div>
            <Button variant="outline" aria-label={`Открыть тему: ${l.title}`} onClick={()=>onOpen(l)}>Открыть тему</Button>
          </article>)}
        </div>
      </section>;
    })}
  </div>;
}

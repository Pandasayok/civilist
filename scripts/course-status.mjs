import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../content/'+name,import.meta.url),'utf8'));
const catalog=read('curriculum.json'),pack=read('course-contracts.json');
let total=0,ready=0;
for(const section of catalog.sections){
 const prepared=section.topics.filter(t=>{
  const lesson=pack.lessons.find(l=>l.id===t.id&&l.branchId===section.branchId);
  const tasks=pack.questions.filter(q=>q.lessonId===t.id&&q.branchId===section.branchId);
  return lesson?.sections?.length>=4&&tasks.length===10&&tasks.filter(q=>q.type!=='short').length>=8;
 });
 total+=section.topics.length;ready+=prepared.length;
 console.log(`${section.title}: ${prepared.length}/${section.topics.length} подготовлено`);
}
console.log(`Всего: ${ready}/${total}. Подготовлено не означает редакторски утверждено.`);
if(process.argv.includes('--require-complete')&&ready!==total)process.exitCode=1;

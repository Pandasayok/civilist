import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateContent} from '../lib/content-validation.ts';
const read=(path:string)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const pack=read('content/course-contracts.json'),catalog=read('content/curriculum.json'),coverage=read('content/textbook-coverage.json');
test('every supplied textbook chapter is mapped to a unique course topic list',()=>{
 assert.deepEqual(coverage.chapters.map((c:any)=>c.chapter),Array.from({length:69},(_,i)=>i+1));
 const topics=catalog.sections.flatMap((s:any)=>s.topics);assert.equal(new Set(topics.map((t:any)=>t.id)).size,topics.length);
 for(const ch of coverage.chapters){assert.ok(ch.topics.length>0);for(const id of ch.topics)assert.ok(topics.some((t:any)=>t.id===id&&t.chapter===ch.chapter&&t.volume===ch.volume));}
});
test('each prepared contract topic has a valid full text and ten distinct tasks',()=>{
 assert.equal(pack.lessons.length,6);assert.equal(pack.questions.length,60);
 assert.equal(new Set(pack.questions.map((q:any)=>q.id)).size,60);
 for(const l of pack.lessons){validateContent('lesson',l);assert.ok(l.sections.length>=4);assert.ok(l.sections.some((s:any)=>s.table||s.steps)||l.id==='contract-types');
  const bank=pack.questions.filter((q:any)=>q.lessonId===l.id);assert.equal(bank.length,10);assert.equal(new Set(bank.map((q:any)=>q.title)).size,10);assert.equal(bank.filter((q:any)=>q.type!=='short').length,9);assert.ok(new Set(bank.map((q:any)=>q.type)).size>=3);
  for(const q of bank){validateContent('question',q);assert.equal(q.branchId,l.branchId);}
 }
});
test('rich lesson validation rejects ragged tables and duplicate section anchors',()=>{
 const l=structuredClone(pack.lessons[0]);l.sections[0].table.rows[0].push('extra');assert.throws(()=>validateContent('lesson',l));
 const duplicate=structuredClone(pack.lessons[0]);duplicate.sections[1].id=duplicate.sections[0].id;assert.throws(()=>validateContent('lesson',duplicate));
});

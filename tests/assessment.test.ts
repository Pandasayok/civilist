import assert from 'node:assert/strict';
import test from 'node:test';
import {grade,selectQuestions,validAnswer,publicQuestion,targetKey} from '../lib/assessment.ts';
import type {Lesson,Question} from '../lib/civilist-types.ts';
const source={label:'Тестовые данные',url:'https://example.org',checkedAt:'2026-10-05'};
const lesson=(id:string):Lesson=>({id,title:id,branchId:'test',topic:'Раздел',minutes:1,summary:'Тест',points:['Тест'],example:'Тест',source});
const question=(lessonId:string,i:number):Question=>({id:`${lessonId}-${i}`,title:`Вопрос ${i}`,branchId:'test',lessonId,type:'single',options:['Да','Нет'],answer:[0],explanation:'Пояснение',source});
test('a topic requires ten distinct tasks, including eight graded tasks',()=>{
 const bank=Array.from({length:10},(_,i)=>question('one',i));
 assert.throws(()=>selectQuestions('topic',[lesson('one')],bank.slice(0,9)),/10/);
 const selected=selectQuestions('topic',[lesson('one')],bank,()=>0.5);assert.equal(selected.length,10);assert.equal(new Set(selected.map(q=>q.id)).size,10);
});
test('final exam covers every lesson and excludes written self-assessments',()=>{
 const lessons=['a','b','c'].map(lesson);const bank=lessons.flatMap(l=>Array.from({length:12},(_,i)=>question(l.id,i)));bank[0]={...bank[0],type:'short',model:'Эталон'};
 const deck=selectQuestions('section',lessons,bank,()=>0.5);assert.equal(deck.length,20);assert.equal(new Set(deck.map(q=>q.lessonId)).size,3);assert.ok(deck.every(q=>q.type!=='short'));
 assert.throws(()=>selectQuestions('section',[...lessons,lesson('missing')],bank));
});
test('unordered multiple choice and ordered matches are graded differently',()=>{
 const q={...question('a',0),type:'multiple' as const,options:['a','b','c'],answer:[0,2]};assert.equal(grade([q],{[q.id]:[2,0]}).passed,true);
 assert.equal(grade([{...q,type:'sequence',answer:[0,1,2]}],{[q.id]:[2,1,0]}).passed,false);
 assert.equal(validAnswer(q,[0,0]),false);assert.equal(validAnswer(q,[3]),false);
});
test('partial matching answers may be saved but cannot finish',()=>{
 const q={...question('a',0),type:'matching' as const,left:['A','B'],answer:[1,0]};assert.equal(validAnswer(q,[-1,0],false),true);assert.equal(validAnswer(q,[-1,0]),false);assert.throws(()=>grade([q],{[q.id]:[-1,0]}));
});
test('written responses do not inflate grade and incomplete attempts cannot finish',()=>{
 const bank=Array.from({length:9},(_,i)=>question('a',i));bank.push({...question('a',9),type:'short',model:'Пример'});
 const answers=Object.fromEntries(bank.map((q,i)=>[q.id,i===9?'Ответ':i<7?[0]:[1]]));const result=grade(bank,answers);
 assert.equal(result.total,9);assert.equal(result.score,7);assert.equal(result.written,1);assert.equal(result.passed,false);
 answers[bank[7].id]=[0];assert.equal(grade(bank,answers).passed,true);
 delete answers[bank[8].id];assert.throws(()=>grade(bank,answers));
});
test('80 percent is the exact threshold; public questions omit keys and models',()=>{
 const bank=Array.from({length:10},(_,i)=>question('a',i));const answers=Object.fromEntries(bank.map((q,i)=>[q.id,i<8?[0]:[1]]));assert.equal(grade(bank,answers).passed,true);
 const publicFields=publicQuestion({...bank[0],model:'Secret'});assert.ok(!('answer' in publicFields));assert.ok(!('model' in publicFields));assert.ok(!('explanation' in publicFields));
 assert.notEqual(targetKey('section','a','b:c'),targetKey('section','a:b','c'));
});

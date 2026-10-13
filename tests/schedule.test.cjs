const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/planning/schedule.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded = new Module('schedule');loaded._compile(compiled,'schedule.cjs');
const {readDate, validDate, rowsFromMatrix, rowsFromPdfLines, rowErrors, shiftDate, dayDistance, exportProjectXml} = loaded.exports;
const importCompiled=ts.transpileModule(fs.readFileSync('src/lib/planning/import.ts','utf8').replace(/import\.meta\.url/g,'"file:///test-import.js"'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const importModule=new Module('import');importModule.require=name=>name==='./schedule'?loaded.exports:require(name);importModule._compile(importCompiled,'import.cjs');

test('strict dates reject calendar overflow and ambiguous short years',()=>{
  assert.equal(readDate('31/02/2026'),'');assert.equal(readDate('29/02/2024'),'2024-02-29');
  assert.equal(readDate('03/04/2026'),'2026-04-03');assert.equal(readDate('03/04/26'),'');
  assert.equal(validDate('2026-13-01'),false);assert.equal(readDate('2026-04-03T08:00:00'),'2026-04-03');
});
test('Excel/CSV table headers can follow a report title',()=>{
  const rows=rowsFromMatrix([['Planning'],['ID','Nom de la tâche','Début','Fin','Activité parente'],[7,'Piquetages','01/06/2026','05/06/2026','Artères de câbles']]);
  assert.equal(rows[0].key,'7');assert.equal(rows[0].start,'2026-06-01');assert.equal(rows[0].parent,'Artères de câbles');
  assert.throws(()=>rowsFromMatrix([['Name','Progress'],['Task',20]]),/Colonnes introuvables/);
});
test('incomplete or reversed imported rows stay visible but invalid',()=>{
  const [row]=rowsFromMatrix([['Name','Start','Finish'],['Task','10/06/2026','01/06/2026']]);
  assert.match(rowErrors(row).join(),/fin précède/);
  assert.ok(rowErrors({...row,finish:''}).length);
});
test('PDF reads explicit dated rows, never infers graphical bars',()=>{
  const rows=rowsFromPdfLines(['Planning juin 2026','1 Piquetages 5 jours 01/06/2026 05/06/2026','Travaux sans dates','2 Massifs 08/06/2026 10/06/2026']);
  assert.equal(rows.length,2);assert.equal(rows[0].title,'Piquetages');assert.equal(rows[1].finish,'2026-06-10');assert.ok(rows[0].warnings.length);
});
test('shifts preserve durations across month/year boundaries',()=>{
  assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
  assert.equal(dayDistance('2026-03-28','2026-03-30'),2);
  assert.equal(dayDistance(shiftDate('2026-06-01',12),shiftDate('2026-06-09',12)),8);
});
test('Project XML escapes titles and retains summary hierarchy',()=>{
  const xml=exportProjectXml([{id:'a',title:'A & <B>',start:'2026-06-01',finish:'2026-06-10',progress:20,summary:true,level:1},{id:'t',title:'Task',start:'2026-06-01',finish:'2026-06-02',progress:0,level:2}]);
  assert.match(xml,/A &amp; &lt;B&gt;/);assert.match(xml,/<Summary>1<\/Summary>/);assert.match(xml,/<OutlineLevel>2<\/OutlineLevel>/);
});
test('UTF-8 French CSV preserves day/month ordering instead of US coercion',async()=>{
  const file=new File(['ID;Nom de la tâche;Début;Fin\n1;Piquetages;01/06/2026;05/06/2026'], 'planning.csv');
  const {rows}=await importModule.exports.readScheduleFile(file);
  assert.equal(rows[0].start,'2026-06-01');assert.equal(rows[0].finish,'2026-06-05');
});
test('binary Project files fail explicitly rather than returning invented tasks',async()=>{
  await assert.rejects(()=>importModule.exports.readScheduleFile(new File(['binary'], 'planning.mpp')),/convertisseur dédié/);
});
test('implicit row identities survive insertion and reordering',()=>{
  const header=['Name','Start','Finish'];const a=['A','01/06/2026','02/06/2026'];const b=['B','03/06/2026','04/06/2026'];
  assert.equal(rowsFromMatrix([header,a,b])[0].key,rowsFromMatrix([header,b,a])[1].key);
  assert.equal(rowsFromPdfLines(['1 A 01/06/2026 02/06/2026'])[0].key,rowsFromPdfLines(['9 A 03/06/2026 04/06/2026'])[0].key);
});

test('Project PDF short years, weekdays and decimal durations are parsed',()=>{
  const rows=rowsFromPdfLines(['4 Guérite 2.00 55 jrs Lun 31/08/26 Lun 19/10/26', '5 Béton 1,5 jrs? Jeu 03/09/26 Ven 04/09/26', '6 Béton 2 jrs Mar 01/09/26 Jeu 03/09/26']);
  assert.equal(rows[0].start,'2026-08-31');assert.equal(rows[0].title,'Guérite 2.00');
  assert.equal(rows[1].title,'Béton');assert.equal(rows[1].finish,'2026-09-04');
  assert.equal(new Set(rows.map(row=>row.key)).size,3);
  assert.ok(rows[2].warnings.some(w=>w.includes('répété')));
  assert.equal(rowsFromPdfLines(['1 Invalid 31/02/26 03/03/26'])[0].start,'');
});

test('PDF groups mixed font baselines and excludes Gantt duplicates',()=>{
  const item=(str,x,y,h=6)=>({str,transform:[1,0,0,1,x,y],height:h,width:10});
  const lines=loaded.exports.pdfTextLines([item('Début',200,100),item('Fin',250,100),item('1',10,80),item('Béton',40,79.3),item('1 jr',150,79.3),item('Lun 31/08/26',200,79.3),item('Lun 31/08/26',250,79.3),item('Béton',450,81)]);
  const rows=rowsFromPdfLines(lines);assert.equal(rows.length,1);assert.equal(rows[0].title,'Béton');
  assert.equal(rows[0].finish,'2026-08-31');
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {SaveController}=require('../electron/save-controller.cjs');
test('button, shortcut and tray saves report saving before completion; failures never report saved',async()=>{
 const events=[];let finish;
 const controller=new SaveController({engine:{save:()=>new Promise(resolve=>finish=resolve)},outputDir:()=>'',flush:async()=>{},onSaving:s=>events.push(['saving',s.trigger]),onSaved:async()=>events.push(['saved']),onFailure:()=>events.push(['error'])});
 for(const trigger of ['button','shortcut','tray']){
  const task=controller.save('replay',Date.now(),trigger);
  assert.deepEqual(events.at(-1),['saving',trigger]);
  finish({id:trigger});await task;assert.deepEqual(events.at(-1),['saved']);
 }
 controller.engine.save=async()=>{throw new Error('Disk full');};
 await assert.rejects(controller.save('replay',Date.now(),'button'),/Disk full/);
 assert.deepEqual(events.slice(-2),[['saving','button'],['error']]);
 assert.equal(controller.pending,0);
});
test('queued native notices leave both saving and terminal errors visible before the next message',async()=>{
 const {Overlay}=require('../electron/overlay.cjs'),overlay=new Overlay(()=>({notifications:true})),seen=[];
 overlay.display=async title=>seen.push({title,at:Date.now()});
 await Promise.all([overlay.show('Saving replay','',{minimumVisibleMs:60}),overlay.show('Could not save replay',''),overlay.show('Next replay','',{minimumVisibleMs:0})]);
 assert.deepEqual(seen.map(v=>v.title),['Saving replay','Could not save replay','Next replay']);
 assert.ok(seen[1].at-seen[0].at>=50);assert.ok(seen[2].at-seen[1].at>=1100);
});

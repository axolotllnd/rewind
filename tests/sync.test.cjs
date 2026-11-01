const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');const ffmpeg=require('ffmpeg-static'),{CaptureEngine}=require('../electron/engine.cjs');
test('export trims earlier audio segment to video start instead of shifting sound by two seconds',async()=>{
 const root=path.resolve('work/sync-test');await fs.mkdir(root,{recursive:true});
 function create(name,input,args){const p=path.join(root,name);const r=spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i',input,'-t','2',...args,p],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return p;}
 const v=create('video.mkv','color=c=black:size=160x90:rate=30',['-c:v','libvpx','-deadline','realtime']);
 const early=create('audio-early.mkv','sine=frequency=440:sample_rate=48000',['-c:a','libopus']);
 const current=create('audio-current.mkv','sine=frequency=880:sample_rate=48000',['-c:a','libopus']);
 const engine=new CaptureEngine(ffmpeg,path.join(root,'cache'),()=>{});
 engine.session={started:Date.now()-8000,config:{outputFormat:'mkv',replaySeconds:2,resolution:90,fps:30},recordStart:null,pins:0,inputs:[{id:'video',label:'Video'},{id:'audio1',label:'Tone'}]};
 engine.segments=async t=>t.id==='video'?[{file:v,start:6,end:8}]:[{file:early,start:4.001,end:6.001},{file:current,start:6.001,end:8.001}];
 const clip=await engine.save(path.join(root,'clips'));
 const pcm=spawnSync(ffmpeg,['-v','error','-ss','0.1','-i',clip.path,'-t','0.5','-map','0:a:0','-ac','1','-ar','48000','-f','s16le','pipe:1'],{windowsHide:true,maxBuffer:2e6});assert.equal(pcm.status,0);let crossings=0,previous=0;for(let i=0;i<pcm.stdout.length;i+=2){const value=pcm.stdout.readInt16LE(i);if((value>=0)!==(previous>=0))crossings++;previous=value;}assert.ok(crossings>800&&crossings<950,`Expected 880 Hz at video start, got ${crossings} zero crossings`);
});

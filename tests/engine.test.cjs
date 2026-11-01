const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn,spawnSync}=require('node:child_process');const fs=require('node:fs/promises');const path=require('node:path');const {CaptureEngine}=require('../electron/engine.cjs');const ffmpeg=require('ffmpeg-static');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('real FFmpeg pipeline saves replay and continuous recording with two independent audio tracks', {timeout:45000},async()=>{
 const root=path.resolve('work','engine-test');await fs.mkdir(root,{recursive:true});const errors=[];const engine=new CaptureEngine(ffmpeg,path.join(root,'cache'),e=>errors.push(e));const sources=[];
 try{
  await engine.start([{id:'video',label:'Video'},{id:'audio1',label:'System'},{id:'audio2',label:'Microphone'}],{outputFormat:'mkv',replaySeconds:15,maxBufferMB:128,resolution:1080,fps:30});
  for(const [id,args] of [['video',['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-g','60','-b:v','300k']],['audio1',['-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-c:a','libopus']],['audio2',['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-c:a','libopus']]]){
   const p=spawn(ffmpeg,['-hide_banner','-loglevel','error','-re',...args,'-t','30','-f','webm','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});sources.push(p);p.stdout.on('data',d=>{p.stdout.pause();engine.append(id,new Uint8Array(d)).then(()=>p.stdout.resume()).catch(e=>errors.push(e.message));});
  }
  await delay(7000);assert.deepEqual(errors,[]);const before=await engine.info();assert.equal(before.active,true);assert.ok(before.bufferBytes>1000);engine.record();await delay(3000);
  const replay=await engine.save(path.join(root,'clips'),'replay');assert.ok(replay.size>10000);assert.equal(replay.tracks,2);
  const recording=await engine.save(path.join(root,'clips'),'record');assert.ok(recording.duration>=2.9);assert.equal((await engine.info()).recording,false);
  engine.session.config.replaySeconds=1;const short=await engine.save(path.join(root,'clips'),'replay');assert.ok(short.size>1000);assert.ok(short.duration>=.5&&short.duration<3);
  const inspect=spawnSync(ffmpeg,['-hide_banner','-i',replay.path],{encoding:'utf8',windowsHide:true});assert.match(inspect.stderr,/Video:/);assert.equal((inspect.stderr.match(/Audio: opus/g)||[]).length,2);assert.match(inspect.stderr,/System/);assert.match(inspect.stderr,/Microphone/);
  const decode=spawnSync(ffmpeg,['-v','error','-i',replay.path,'-map','0','-f','null','-'],{encoding:'utf8',windowsHide:true});assert.equal(decode.status,0,decode.stderr);
 }finally{for(const p of sources)p.kill();await engine.stop();}
});

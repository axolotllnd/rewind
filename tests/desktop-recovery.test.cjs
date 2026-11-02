const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {NativeScreen,desktopUnavailable}=require('../electron/native-screen.cjs'),{CaptureEngine}=require('../electron/engine.cjs'),{MediaService}=require('../electron/media.cjs');
const config={width:160,resolution:90,fps:20,bitrate:2,replaySeconds:120,outputFormat:'mp4'},output={adapter:0,index:0,width:160,height:90};
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(predicate){const end=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<end,'Timed out');await tick();}}
function harness(){
 const children=[],writes=[],failures=[],events=[],session={started:Date.now(),recordStart:0,lastReplayAt:1};
 const engine={session,append:async(id,data)=>writes.push(Buffer.from(data))};
 const capture=new NativeScreen('',null,{retryDelayMs:5,maxRetryDelayMs:10,stopTimeoutMs:5,killTimeoutMs:5,spawnProcess(){
  const p=new EventEmitter();p.stdin=new EventEmitter();p.stdin.write=()=>{};p.stdout=new EventEmitter();p.stdout.pause=()=>{};p.stdout.resume=()=>{};p.stderr=new EventEmitter();p.exitCode=null;p.kill=()=>{};children.push(p);return p;
 }});
 capture.on('failure',m=>failures.push(m));capture.on('recovering',()=>events.push('recovering'));capture.on('restored',()=>events.push('restored'));
 const ready=p=>p.stderr.emit('data',Buffer.from('frame=1\n'));
 const close=(p,message)=>{if(message)p.stderr.emit('data',Buffer.from(message+'\n'));p.exitCode=message?1:0;p.emit('close',p.exitCode);};
 return {capture,engine,session,children,writes,failures,events,ready,close};
}
test('UAC access loss retries access denied, restores the same buffer and keeps audio/replay boundaries',async()=>{
 const h=harness();try{
  const start=h.capture.start(h.engine,config,output);h.ready(h.children[0]);await start;
  h.children[0].stdout.emit('data',Buffer.from('before'));h.close(h.children[0],'[Parsed_ddagrab_0] AcquireNextFrame failed: 887a0026');
  await until(()=>h.children.length===2);assert.equal(h.capture.active,true);assert.equal(h.capture.recovering,true);
  h.close(h.children[1],'[Parsed_ddagrab_0] DuplicateOutput failed: 80070005');
  await until(()=>h.children.length===3);h.ready(h.children[2]);h.children[2].stdout.emit('data',Buffer.from('after'));await tick();
  assert.equal(h.engine.session,h.session);assert.equal(h.session.recordStart,0);assert.equal(h.session.lastReplayAt,1);
  assert.equal(h.capture.active,true);assert.equal(h.capture.recovering,false);assert.deepEqual(h.events,['recovering','restored']);assert.deepEqual(h.failures,[]);assert.equal(Buffer.concat(h.writes).toString(),'beforeafter');
 }finally{await h.capture.stop();}
});
test('stop during a desktop switch cancels retries; a late old process event cannot revive capture',async()=>{
 const h=harness();const start=h.capture.start(h.engine,config,output);h.ready(h.children[0]);await start;
 h.close(h.children[0],'[Parsed_ddagrab_0] AcquireNextFrame failed: 887a0026');await tick();await h.capture.stop();const count=h.children.length;
 h.ready(h.children[0]);h.close(h.children[0],'[Parsed_ddagrab_0] AcquireNextFrame failed: 887a0026');await new Promise(r=>setTimeout(r,40));assert.equal(h.children.length,count);assert.equal(h.capture.active,false);assert.deepEqual(h.failures,[]);
});
test('desktop recovery also works before the first frame, while real encoding failures remain visible',async()=>{
 const h=harness();try{const start=h.capture.start(h.engine,config,output);h.close(h.children[0],'[Parsed_ddagrab_0] DuplicateOutput failed: 80070005');await until(()=>h.children.length===2);h.ready(h.children[1]);await start;h.close(h.children[1],'[h264_nvenc] No capable devices found');await tick();assert.equal(h.failures.length,1);assert.match(h.failures[0],/No capable devices/);assert.equal(h.capture.active,false);}finally{await h.capture.stop();}
 assert.equal(desktopUnavailable('Disk write failed: 80070005'),false);assert.equal(desktopUnavailable('[ddagrab] AcquireNextFrame failed: 887a0026'),true);
});
test('real FFmpeg accepts restarted encoders in one buffer and preserves video/audio time across a desktop gap',{timeout:20000},async()=>{
 const ffmpeg=require('ffmpeg-static'),root=path.resolve('work/desktop-recovery-tests',String(Date.now()));await fs.mkdir(root,{recursive:true});
 function make(args){const r=spawnSync(ffmpeg,['-hide_banner','-v','error',...args],{windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;}
 function video(offset,color){return make(['-copyts','-f','lavfi','-i',`color=c=${color}:s=160x90:r=20:d=3`,'-vf',`setpts=PTS+${offset}/TB`,'-c:v','libx264','-preset','ultrafast','-bf','0','-g','20','-r','20','-fps_mode','cfr','-f','mpegts','-mpegts_copyts','1','-mpegts_flags','+resend_headers+initial_discontinuity','-muxdelay','0','pipe:1']);}
 const first=video(0,'red'),second=video(6,'blue'),audio=make(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=10','-c:a','libopus','-f','webm','pipe:1']);
 const errors=[],engine=new CaptureEngine(ffmpeg,path.join(root,'cache'),e=>errors.push(e));
 try{
  await engine.start([{id:'video',label:'Video',preserveTimestamps:true,inputFormat:'mpegts'},{id:'audio1',label:'Tone'}],config);const s=engine.session;s.started-=11000;s.inputs.forEach(t=>t.started=s.started);
  await engine.append('video',first);await engine.append('video',second);await engine.append('audio1',audio);
  // Closing only these synthetic input pipes flushes final segment lists.
  await Promise.all(s.inputs.map(t=>new Promise(resolve=>{t.proc.once('exit',resolve);t.proc.stdin.end();})));
  assert.deepEqual(errors,[]);const parts=await engine.segments(s.inputs[0],{closedOnly:true});
  assert.ok(parts.some(p=>p.start>=5.9),'Recovered video kept its wall-clock timestamp');
  const clip=await engine.save(path.join(root,'clips'),'replay',{requestedAt:s.started+8500});assert.equal(clip.duration,8.5);
  const meta=await new MediaService(ffmpeg,path.join(root,'preview'),()=>{}).probe(clip.path);assert.ok(Math.abs(meta.duration-8.5)<.15,JSON.stringify(meta));
  function pixel(at){const rgb=make(['-ss',String(at),'-i',clip.path,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);return [...rgb];}
  const before=pixel(1),after=pixel(7);assert.ok(before[0]>200&&before[2]<30,before.toString());assert.ok(after[2]>200&&after[0]<30,after.toString());
  const pcm=make(['-ss','7','-i',clip.path,'-t','0.1','-map','0:a:0','-f','s16le','pipe:1']);assert.ok(pcm.length>1000,'Audio still present after recovery');
 }finally{await engine.stop();}
});

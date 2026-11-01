const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ffmpeg=require('ffmpeg-static'),{CaptureEngine}=require('../electron/engine.cjs'),{MediaService}=require('../electron/media.cjs'),{validateConfig}=require('../electron/config.cjs');
function ff(args,raw=false){const result=spawnSync(ffmpeg,['-v','error','-y',...args],{windowsHide:true,encoding:raw?undefined:'utf8',maxBuffer:5e6});assert.equal(result.status,0,String(result.stderr));return result.stdout;}
async function fixture(name,codec='h264',format='mp4'){
 const root=path.resolve('work/fast-save-tests',name);await fs.mkdir(root,{recursive:true});const video=path.join(root,'source.mkv'),audio=path.join(root,'tone.mkv');
 ff(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','8',...(codec==='h264'?['-c:v','libx264','-preset','ultrafast','-g','300']:['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-g','300','-b:v','800k']),'-threads','2',video]);
 ff(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','8','-c:a','libopus',audio]);
 const epoch=Date.now()-10000,events=[],engine=new CaptureEngine(ffmpeg,path.join(root,'cache'),()=>{},e=>events.push(e));
 engine.session={started:epoch,dir:root,config:{outputFormat:format,replaySeconds:120,resolution:180,fps:30},recordStart:null,lastReplayAt:null,pins:0,inputs:[{id:'video',label:'Video'},{id:'audio1',label:'System'},{id:'audio2',label:'Microphone'}]};
 engine.segments=async track=>[{file:track.id==='video'?video:audio,start:0,end:8}];
 return {root,engine,epoch,video,audio,events};
}
function hashes(file,start=0,length){return ff([...(start?['-ss',String(start)]:[]),'-i',file,...(length?['-t',String(length)]:[]),'-map','0:v','-f','framemd5','pipe:1']).split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1).trim());}
test('MP4 saves mid-GOP H.264 and VP9 losslessly with exact visible frames, separate audio and no overlapping replays',async()=>{
 for(const codec of ['h264','vp9']){
  const {root,engine,epoch,video,events}=await fixture(codec,codec),out=path.join(root,'clips');
  const first=await engine.save(out,'replay',{requestedAt:epoch+2000}),second=await engine.save(out,'replay',{requestedAt:epoch+4350});
  assert.deepEqual(hashes(first.path),hashes(video,0,2));
  assert.deepEqual(hashes(second.path),hashes(video,2,2.35));
  assert.equal(second.startTime,first.endTime);assert.ok(Math.abs(second.duration-2.35)<1e-9);assert.equal(second.tracks,2);assert.ok(second.path.endsWith('.mp4'));
  const media=new MediaService(ffmpeg,path.join(root,'editor'),()=>{}),meta=await media.probe(second.path);
  assert.ok(Math.abs(meta.duration-2.35)<.04);assert.equal(meta.codec,codec);assert.equal(meta.audio.length,2);assert.equal(meta.audio[0].name,'System');
  assert.equal(events.at(-1).mode,'stream-copy');assert.equal(events.at(-1).encoder,'copy');assert.equal(events.at(-1).inputCopiedBytes,0);
  const preview=await media.preview(second);assert.equal(media.assets.get(preview.url.split('/').at(-1)),second.path,'Editor reuses native MP4 instead of copying the video');
  assert.deepEqual((await fs.readdir(out)).filter(name=>name.includes('.partial.')),[]);
 }
});
test('MKV and WebM remain playable with bounded precise trimming and independent audio tracks',async()=>{
 for(const [format,codec] of [['mkv','h264'],['webm','vp9']]){
  const {root,engine,epoch}=await fixture(format,codec,format);engine.session.lastReplayAt=2;
  const clip=await engine.save(path.join(root,'clips'),'replay',{requestedAt:epoch+4350});
  ff(['-i',clip.path,'-map','0','-f','null','-']);
  const meta=await new MediaService(ffmpeg,path.join(root,'editor'),()=>{}).probe(clip.path);
  assert.ok(clip.path.endsWith('.'+format));assert.equal(meta.audio.length,2);assert.ok(Math.abs(meta.duration-2.35)<.08);assert.equal(clip.performance.mode,'bounded-encode');
  if(format==='webm')assert.equal(meta.codec,'vp9');
 }
});
test('failed direct writes publish no partial clip and do not consume the replay interval',async()=>{
 const {root,engine,epoch}=await fixture('atomic'),out=path.join(root,'clips');
 await engine.videoCodec(engine.session,path.join(root,'source.mkv'));
 engine.run=async args=>{await fs.writeFile(args.at(-1),'partial write');throw Error('Disk full');};
 await assert.rejects(engine.save(out,'replay',{requestedAt:epoch+4350}),/Disk full/);
 assert.equal(engine.session.lastReplayAt,null);assert.deepEqual(await fs.readdir(out),[]);assert.equal(engine.session.pins,0);
});
test('format and codec selection rejects incompatible containers and negotiates a supported capture codec',async()=>{
 for(const outputFormat of ['mp4','mkv','webm'])assert.equal(validateConfig({outputFormat}).outputFormat,outputFormat);
 assert.throws(()=>validateConfig({outputFormat:'avi'}));assert.throws(()=>validateConfig({outputFormat:'webm',codec:'h264'}));assert.throws(()=>validateConfig({outputFormat:'mp4',codec:'vp8'}));
 const {Recorder}=await import('../src/capture.js'),original=globalThis.MediaRecorder;
 try{globalThis.MediaRecorder={isTypeSupported:()=>true};assert.match(Recorder.mime('auto','mp4'),/avc1/);assert.match(Recorder.mime('auto','webm'),/vp9/);assert.throws(()=>Recorder.mime('h264','webm'));assert.throws(()=>Recorder.mime('vp8','mp4'));}
 finally{globalThis.MediaRecorder=original;}
});

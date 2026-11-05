const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {mkdtemp}=require('node:fs/promises');
const path=require('node:path');
const {NativeAudio}=require('../electron/audio.cjs');
const {CaptureEngine}=require('../electron/engine.cjs');

const fixture=`
 const net=require('node:net');
 const servers=[320,320,960,1440].map(frequency=>net.createServer(socket=>{
  socket.on('error',()=>{});
  const pcm=Buffer.alloc(48000*8*5);
  for(let i=0;i<48000*5;i++){
   const value=.3*Math.sin(2*Math.PI*frequency*i/48000);
   pcm.writeFloatLE(value,i*8);pcm.writeFloatLE(value,i*8+4);
  }
  socket.write(pcm);
 }));
 Promise.all(servers.map(server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))))
  .then(()=>console.log(JSON.stringify(servers.map(server=>server.address().port))));
`;

test('four sources use one bridge and one encoder while saving three separate audio tracks',{timeout:15000},async()=>{
 const ffmpeg=process.env.REWIND_TEST_FFMPEG||require('ffmpeg-static');
 const root=await mkdtemp(path.resolve('work/shared-audio-'));
 const errors=[],children=[];
 const engine=new CaptureEngine(ffmpeg,root,error=>errors.push(error));
 const audio=new NativeAudio('synthetic',ffmpeg,error=>errors.push(error),{
  spawnProcess(exe,args,options){
   const child=exe==='synthetic'?spawn(process.execPath,['-e',fixture],options):spawn(exe,args,options);
   children.push(child);
   return child;
  }
 });
 const config={replaySeconds:30,outputFormat:'mp4',audio:[1,1,2,3].map(track=>({enabled:true,track,gain:100,flow:'output',deviceId:'default'}))};
 const video=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=s=160x90:r=20:d=5','-c:v','libx264','-g','20','-threads','1','-f','matroska','pipe:1'],{windowsHide:true});
 assert.equal(video.status,0,video.stderr.toString());
 try{
  for(let pass=0;pass<2;pass++){
   await engine.start([{id:'video'},...[1,2,3].map(track=>({id:'audio'+track,external:true}))],config);
   assert.ok(engine.session.inputs.slice(1).every(track=>!track.proc));
   engine.session.started=Date.now()-5000;
   await engine.append('video',video.stdout);
   await audio.start(config,engine);
   await engine.waitForCoverage(engine.session,pass?4:2);
   assert.equal(children.length,(pass+1)*2);
   if(!pass){
    const clip=await engine.save(root,'replay',{requestedAt:engine.session.started+2000});
    assert.equal(clip.tracks,3);
    for(let index=0;index<3;index++){
     const decoded=spawnSync(ffmpeg,['-v','error','-i',clip.path,'-map',`0:a:${index}`,'-ac','1','-f','f32le','pipe:1'],{windowsHide:true});
     assert.equal(decoded.status,0,decoded.stderr.toString());
     const pcm=decoded.stdout.subarray(4800*4,9600*4);
     let crossings=0,power=0;
     for(let i=4;i<pcm.length;i+=4){
      const sample=pcm.readFloatLE(i);
      if(sample>0&&pcm.readFloatLE(i-4)<=0)crossings++;
      power+=sample*sample;
     }
     assert.ok(Math.abs(crossings-[32,96,144][index])<=1,`wrong source on track ${index+1}: ${crossings}`);
     assert.ok(power/4800>(index===0?.13:.03),'incorrect mix level');
    }
   }
   await audio.stop();
   assert.ok(children.every(child=>child.exitCode!==null||child.signalCode));
   await engine.stop({preserve:true});
  }
  assert.deepEqual(errors,[]);
 }finally{
  await audio.stop();
  await engine.stop({preserve:true});
 }
});

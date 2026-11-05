const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp}=require('node:fs/promises');
const path=require('node:path');
const {NativeAudio}=require('../electron/audio.cjs');
const {CaptureEngine}=require('../electron/engine.cjs');
const helper=path.resolve('assets/native/AudioBridge.exe');
const ffmpeg=require('ffmpeg-static');
const config={replaySeconds:30,audio:[{id:'test',label:'Output',deviceId:'default',flow:'output',enabled:true,track:1,gain:100}]};

async function fixture(){
 const errors=[],root=await mkdtemp(path.resolve('work/native-audio-'));
 const engine=new CaptureEngine(ffmpeg,root,error=>errors.push(error));
 const native=new NativeAudio(helper,ffmpeg,error=>errors.push(error));
 const start=async()=>{
  await engine.start([{id:'audio1',external:true,label:'Output'}],config);
  await native.start(config,engine);
 };
 const stop=async()=>{await native.stop();await engine.stop();};
 return {errors,engine,native,start,stop};
}

test('Windows enumerates inputs and outputs and captures the selected output',{timeout:15000},async()=>{
 const {errors,engine,native,start,stop}=await fixture();
 const devices=await native.list();
 assert.ok(devices.some(device=>device.flow==='output'));
 assert.ok(devices.every(device=>device.id&&device.name));
 try{
  await start();
  const [parts]=await engine.waitForCoverage(engine.session,1);
  assert.ok(parts.length>0);
  assert.deepEqual(errors,[]);
 }finally{await stop();}
});

test('delayed native helper pads silence to common epoch instead of starting its own clock',{timeout:10000},async()=>{
 const epoch=Date.now();
 await new Promise(resolve=>setTimeout(resolve,450));
 const process=spawn(helper,['capture','default','output',String(epoch)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let total=0,firstSilence=0,failed='';
 process.stdout.on('data',data=>{
  for(let i=0;i<data.length&&total+i<120000;i++)if(data[i]===0)firstSilence++;
  total+=data.length;
 });
 process.stderr.on('data',data=>failed+=data);
 try{
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal(failed,'');
  assert.ok(total>320000,`Expected common-clock PCM including startup gap; got ${total} bytes`);
  assert.equal(firstSilence,120000);
 }finally{process.kill();}
});

test('rapid restart ignores exits from the previous audio capture',{timeout:15000},async()=>{
 const {errors,engine,start,stop}=await fixture();
 try{
  await start();
  await stop();
  await start();
  const [parts]=await engine.waitForCoverage(engine.session,1);
  assert.ok(parts.length>0);
  assert.deepEqual(errors,[]);
 }finally{await stop();}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');const {NativeScreen,screenArguments}=require('../electron/native-screen.cjs');
const config={width:2560,resolution:1440,fps:165,bitrate:150},output={adapter:0,index:0,width:2560,height:1440};
test('compatibility capture stays on the selected monitor, limits its cost and keeps the original epoch',()=>{
 const args=screenArguments(config,{...output,x:-2560,y:120},1234,{compatibility:true});
 assert.equal(args[args.indexOf('-offset_x')+1],'-2560');assert.equal(args[args.indexOf('-offset_y')+1],'120');assert.equal(args[args.indexOf('-framerate')+1],'60');assert.equal(args[args.indexOf('-i')+1],'desktop');assert.ok(!args.includes('-init_hw_device'));assert.match(args[args.indexOf('-vf')+1],/RTCTIME-1234000/);assert.equal(args[args.indexOf('-fps_mode')+1],'passthrough');
});
test('a desktop timestamp jump does not encode thousands of replacement frames',()=>{
 const {spawnSync}=require('node:child_process');
 const result=spawnSync(require('ffmpeg-static'),['-hide_banner','-v','error','-copyts','-f','lavfi','-i','color=s=160x90:r=20:d=0.3','-vf',"setpts=PTS+if(gte(N\\,3)\\,60/TB\\,0)",'-fps_mode','passthrough','-progress','pipe:1','-f','null','-'],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/frame=6\n/);assert.match(result.stdout,/dup_frames=0/);
});
test('a hung process is replaced with compatibility capture; a protected desktop is waited out without spawning capture',async()=>{
 const children=[],events=[];let accessible=false;
 const capture=new NativeScreen('',null,{stallTimeoutMs:20,retryDelayMs:2,maxRetryDelayMs:3,desktopReady:async()=>accessible,stopTimeoutMs:2,killTimeoutMs:2,spawnProcess(_exe,args){
  const p=new EventEmitter();p.args=args;p.stdin=new EventEmitter();p.stdin.write=()=>{};p.stdout=new EventEmitter();p.stdout.pause=()=>{};p.stdout.resume=()=>{};p.stderr=new EventEmitter();p.exitCode=null;p.kill=()=>{p.exitCode=1;queueMicrotask(()=>p.emit('close',1));};children.push(p);return p;
 }});
 const until=async fn=>{const end=Date.now()+1500;while(!fn()){assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,5));}};
 capture.on('stalled',()=>events.push('stalled'));capture.on('restored',()=>events.push('restored'));
 try{const starting=capture.start({session:{started:Date.now()},append:async()=>{}},config,output);children[0].stderr.emit('data',Buffer.from('frame=1\n'));await starting;await until(()=>events.includes('stalled'));await new Promise(r=>setTimeout(r,35));assert.equal(children.length,1);assert.equal(capture.recovering,true);
 accessible=true;await until(()=>children.length===2);assert.ok(children[1].args.includes('gdigrab'));children[1].stderr.emit('data',Buffer.from('frame=1\n'));assert.equal(capture.recovering,false);assert.equal(capture.actual.backend,'desktop-compatibility');assert.equal(capture.actual.frameRate,60);assert.ok(events.includes('restored'));
 }finally{await capture.stop();}
});
test('native screen keeps full-size GPU frames, bounded resize and a shared timestamp epoch',()=>{
 const args=screenArguments(config,output,1000),vf=args[args.indexOf('-vf')+1];assert.match(vf,/RTCTIME-1000000/);assert.doesNotMatch(vf,/hwdownload|scale=/);assert.ok(args.includes('h264_nvenc'));assert.equal(args[args.indexOf('-bf')+1],'0');assert.equal(args[args.indexOf('-fps_mode')+1],'passthrough');assert.equal(args[args.lastIndexOf('-f')+1],'mpegts');assert.equal(args[args.indexOf('-mpegts_copyts')+1],'1');
 const scaled=screenArguments({...config,width:1920,resolution:1080},output,1000);assert.match(scaled[scaled.indexOf('-vf')+1],/hwdownload,format=bgra,scale=1920:1080/);assert.equal(scaled[scaled.indexOf('-filter_threads')+1],'2');
});
test('late close from an old native process cannot stop or fail a restarted capture',async()=>{
 const children=[];function spawnProcess(){const p=new EventEmitter();p.stdin=new EventEmitter();p.stdin.write=()=>{};p.stdout=new EventEmitter();p.stdout.pause=()=>{};p.stdout.resume=()=>{};p.stderr=new EventEmitter();p.exitCode=null;p.kill=()=>{};children.push(p);return p;}
 const capture=new NativeScreen('',null,{spawnProcess,stopTimeoutMs:5,killTimeoutMs:5}),errors=[];capture.on('failure',e=>errors.push(e));const engine={session:{started:Date.now()},append:async()=>{}};
 let first=capture.start(engine,config,output);children[0].stderr.emit('data',Buffer.from('frame=1\n'));await first;await capture.stop();
 let second=capture.start(engine,config,output);children[1].stderr.emit('data',Buffer.from('frame=1\n'));await second;children[0].emit('close',1);assert.equal(capture.active,true);assert.deepEqual(errors,[]);
 const stopped=capture.stop();children[1].emit('close',0);await stopped;assert.equal(capture.active,false);
});

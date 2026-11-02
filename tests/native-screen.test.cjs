const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');const {NativeScreen,screenArguments}=require('../electron/native-screen.cjs');
const config={width:2560,resolution:1440,fps:165,bitrate:150},output={adapter:0,index:0,width:2560,height:1440};
test('native screen keeps full-size GPU frames, bounded resize and a shared timestamp epoch',()=>{
 const args=screenArguments(config,output,1000),vf=args[args.indexOf('-vf')+1];assert.match(vf,/RTCTIME-1000000/);assert.doesNotMatch(vf,/hwdownload|scale=/);assert.ok(args.includes('h264_nvenc'));assert.equal(args[args.indexOf('-bf')+1],'0');assert.equal(args[args.indexOf('-fps_mode')+1],'cfr');assert.equal(args[args.lastIndexOf('-f')+1],'mpegts');assert.equal(args[args.indexOf('-mpegts_copyts')+1],'1');
 const scaled=screenArguments({...config,width:1920,resolution:1080},output,1000);assert.match(scaled[scaled.indexOf('-vf')+1],/hwdownload,format=bgra,scale=1920:1080/);assert.equal(scaled[scaled.indexOf('-filter_threads')+1],'2');
});
test('late close from an old native process cannot stop or fail a restarted capture',async()=>{
 const children=[];function spawnProcess(){const p=new EventEmitter();p.stdin=new EventEmitter();p.stdin.write=()=>{};p.stdout=new EventEmitter();p.stdout.pause=()=>{};p.stdout.resume=()=>{};p.stderr=new EventEmitter();p.exitCode=null;p.kill=()=>{};children.push(p);return p;}
 const capture=new NativeScreen('',null,{spawnProcess,stopTimeoutMs:5,killTimeoutMs:5}),errors=[];capture.on('failure',e=>errors.push(e));const engine={session:{started:Date.now()},append:async()=>{}};
 let first=capture.start(engine,config,output);children[0].stderr.emit('data',Buffer.from('frame=1\n'));await first;await capture.stop();
 let second=capture.start(engine,config,output);children[1].stderr.emit('data',Buffer.from('frame=1\n'));await second;children[0].emit('close',1);assert.equal(capture.active,true);assert.deepEqual(errors,[]);
 const stopped=capture.stop();children[1].emit('close',0);await stopped;assert.equal(capture.active,false);
});

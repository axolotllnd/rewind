// Compare the previous packaged engine with the current one using identical material.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const ffmpeg=require('ffmpeg-static'),{CaptureEngine}=require('../electron/engine.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/performance/benchmark');
async function run(args,{probe=false}={}){return new Promise((resolve,reject)=>{
 const proc=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});try{os.setPriority(proc.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
 let stderr='';proc.stderr.on('data',d=>stderr+=d);proc.on('error',reject);proc.on('close',code=>code===0||probe&&code===1?resolve(stderr):reject(Error(stderr.slice(-1000))));
});}
async function main(){
 await fs.mkdir(work,{recursive:true});const video=path.join(work,'1080p60.mkv'),audio=path.join(work,'audio.mkv');
 await run(['-v','error','-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=60','-t','20','-c:v','libx264','-preset','ultrafast','-crf','20','-g','120','-threads','2',video]);
 await run(['-v','error','-y','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','20','-c:a','libopus',audio]);
 const Previous=require(path.join(root,'outputs/REWIND-0.2.2/resources/app/electron/engine.cjs')).CaptureEngine,results=[];
 for(const [name,Engine] of [['0.2.2',Previous],['0.2.3',CaptureEngine]]){
  const engine=new Engine(ffmpeg,path.join(work,name,'cache'),()=>{}),epoch=Date.now()-30000,usage=[];
  engine.encoderPromise=Promise.resolve('libx264');
  engine.session={started:epoch,dir:work,config:{outputFormat:'mp4',replaySeconds:120,resolution:1080,fps:60},lastReplayAt:3.4,recordStart:null,pins:0,inputs:[{id:'video',label:'Video'},{id:'audio1',label:'Audio'}]};
  engine.segments=async track=>[{file:track.id==='video'?video:audio,start:0,end:20}];
  engine.run=async(args,_timeout,options={})=>{
   if(options.probe)return run(args,options);
   // Equal two-thread CPU budget for the old encoder and the new remux.
   const limited=args.flatMap(value=>value==='-i'?['-threads','2','-i']:[value]);
   limited.splice(-1,0,'-threads:v','2','-filter_threads','1','-benchmark','-loglevel','info');
   const stderr=await run(limited),match=stderr.match(/utime=([\d.]+)s stime=([\d.]+)s rtime=([\d.]+)s/);
   if(match)usage.push({cpuSeconds:+match[1]+(+match[2]),wallSeconds:+match[3]});return stderr;
  };
  const at=Date.now(),clip=await engine.save(path.join(work,name,'clips'),'replay',{requestedAt:epoch+18900});
  results.push({version:name,saveMs:Date.now()-at,ffmpeg:usage,duration:clip.duration,outputBytes:clip.size,performance:clip.performance||null});
 }
 const report={scenario:'1920×1080, 60 FPS, 15.5-second replay, mid-GOP start, separate Opus audio; synthetic testsrc2, same two-thread CPU budget',sourceBytes:(await fs.stat(video)).size,results,speedup:results[0].saveMs/results[1].saveMs};
 await fs.writeFile(path.join(work,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

const {spawn,execFile}=require('node:child_process');
const {once}=require('node:events');
const {mixFilter}=require('./audio-processing.cjs');
const {segmentArguments}=require('./engine.cjs');

function encoderArguments(ports,tracks){
 const args=['-hide_banner','-loglevel','error','-nostdin','-filter_complex_threads','1'];
 for(const port of ports){
  args.push('-thread_queue_size','1024','-probesize','32','-analyzeduration','1','-f','f32le','-ar','48000','-ac','2','-i',`tcp://127.0.0.1:${port}`);
 }
 args.push('-filter_complex',tracks.map(track=>mixFilter(track.sources,track.id)).join(';'));
 for(const track of tracks){
  args.push('-map',`[${track.id}]`,'-c:a','libopus','-b:a','192k','-threads:a','1',...segmentArguments(track.folder));
 }
 return args;
}

function readPorts(child,count){
 return new Promise((resolve,reject)=>{
  let pending='';
  const timeout=setTimeout(()=>finish(Error('Audio bridge did not report its ports')),5000);
  function finish(error,ports){
   clearTimeout(timeout);
   child.stdout.off('data',read);
   child.off('close',closed);
   child.off('error',finish);
   error?reject(error):resolve(ports);
  }
  const closed=()=>finish(Error('Audio bridge stopped before startup'));
  function read(chunk){
   pending+=chunk.toString('utf8');
   if(pending.length>1024)return finish(Error('Invalid audio bridge handshake'));
   if(!pending.includes('\n'))return;
   try{
    const ports=JSON.parse(pending.split('\n',1)[0]);
    if(!Array.isArray(ports)||ports.length!==count||new Set(ports).size!==count||
       ports.some(port=>!Number.isInteger(port)||port<1||port>65535))throw Error('Invalid audio bridge ports');
    finish(null,ports);
   }catch(error){finish(error);}
  }
  child.stdout.on('data',read);
  child.once('close',closed);
  child.once('error',finish);
 });
}

class NativeAudio{
 constructor(helper,ffmpeg,onError,{spawnProcess=spawn}={}){
  Object.assign(this,{helper,ffmpeg,onError,spawnProcess});
 }
 list(){
  return new Promise((resolve,reject)=>execFile(this.helper,['list'],{windowsHide:true,encoding:'utf8',timeout:8000},(error,stdout,stderr)=>{
   if(error)return reject(Error(stderr||error.message));
   try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'')));}catch{reject(Error('Windows audio device enumeration failed'));}
  }));
 }
 async start(config,engine){
  if(this.run||this.stopping)throw Error('Audio capture already running');
  const sources=config.audio.filter(source=>source.enabled);
  if(!sources.length)return;
  const session=engine.session;
  const tracks=session.inputs.filter(track=>track.external).map(track=>({
   ...track,sources:sources.map((source,inputIndex)=>({...source,inputIndex})).filter(source=>`audio${source.track}`===track.id)
  }));
  if(tracks.some(track=>!track.sources.length)||tracks.reduce((count,track)=>count+track.sources.length,0)!==sources.length){
   throw Error('Audio tracks do not match the capture session');
  }
  const run=this.run={engine,session,started:false};
  const deviceArgs=sources.flatMap(source=>[
   source.deviceId==='system'?'default':source.deviceId,
   source.flow||(source.id==='system'?'output':'input')
  ]);
  try{
   run.helper=this.launch(run,this.helper,['capture-many',String(session.started),...deviceArgs],'Audio bridge','pipe');
   const ports=await readPorts(run.helper.child,sources.length);
   if(!this.current(run))throw Error('Capture stopped during audio startup');
   run.encoder=this.launch(run,this.ffmpeg,encoderArguments(ports,tracks),'Audio encoder','ignore');
   await once(run.encoder.child,'spawn');
   if(!this.current(run)||run.helper.child.exitCode!==null||run.helper.child.signalCode){
    throw Error(run.helper.stderr||'Audio bridge stopped during startup');
   }
   run.started=true;
  }catch(error){
   if(this.run===run)await this.stop();
   throw error;
  }
 }
 current(run){
  return this.run===run&&run.engine.session===run.session;
 }
 launch(run,exe,args,label,stdout){
  const child=this.spawnProcess(exe,args,{windowsHide:true,stdio:['ignore',stdout,'pipe']});
  const process={child,stderr:'',closed:false};
  child.stderr.on('data',chunk=>{process.stderr=(process.stderr+chunk).slice(-3000);});
  child.on('error',error=>{process.stderr=error.message;});
  process.done=new Promise(resolve=>child.once('close',(code,signal)=>{
   process.closed=true;
   resolve();
   if(run.started&&this.current(run))this.onError(`${label}: ${process.stderr.trim()||signal||code}`);
  }));
  return process;
 }
 stop(){
  if(this.stopping)return this.stopping;
  const run=this.run;
  if(!run)return Promise.resolve();
  this.run=null;
  if(run.helper&&!run.helper.closed)run.helper.child.kill();
  const deadline=setTimeout(()=>{if(run.encoder&&!run.encoder.closed)run.encoder.child.kill();},1500);
  this.stopping=Promise.all([run.helper?.done,run.encoder?.done]).finally(()=>{
   clearTimeout(deadline);
   this.stopping=null;
  });
  return this.stopping;
 }
}
module.exports={NativeAudio};

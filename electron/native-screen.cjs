const {spawn,execFile}=require('node:child_process'),{EventEmitter}=require('node:events');
function screenArguments(config,output,epoch,{duration}={}){
 const fps=config.fps,filter=`ddagrab=output_idx=${output.index}:framerate=${fps}:draw_mouse=1`,scale=config.width!==output.width||config.resolution!==output.height;
 const videoFilter=[`setpts=(RTCTIME-${Math.round(epoch*1000)})/(1000000*TB)`,...(scale?['hwdownload','format=bgra',`scale=${config.width}:${config.resolution}:flags=fast_bilinear`,'format=nv12']:[])].join(',');
 // Transport Stream accepts fresh encoder headers after a desktop switch. Keep
 // wall-clock timestamps so the segmenter and the uninterrupted audio stay aligned.
 return ['-hide_banner','-loglevel','warning','-nostats','-stats_period','0.2','-progress','pipe:2','-init_hw_device',`d3d11va=capture:${output.adapter}`,'-filter_hw_device','capture','-copyts','-f','lavfi','-i',filter,'-an','-vf',videoFilter,'-filter_threads','2','-c:v','h264_nvenc','-preset','p1','-tune','ull','-profile:v','high','-bf','0','-rc','vbr','-b:v',`${config.bitrate}M`,'-maxrate',`${config.bitrate}M`,'-bufsize',`${config.bitrate*2}M`,'-g',String(fps),'-rc-lookahead','0','-r',String(fps),'-fps_mode','cfr',...(duration?['-t',String(duration)]:[]),'-f','mpegts','-mpegts_copyts','1','-mpegts_flags','+resend_headers+initial_discontinuity','-muxdelay','0','-flush_packets','1','pipe:1'];
}
function desktopUnavailable(message,{running=false}={}){return /(?:ddagrab|DuplicateOutput|desktop duplication)[\s\S]*(?:887a0026|887a0028|887a0025|80070005|DXGI_ERROR_ACCESS_LOST|E_ACCESSDENIED)/i.test(message)||running&&/ddagrab[\s\S]*887a0004/i.test(message);}
class NativeScreen extends EventEmitter{
 constructor(ffmpeg,probe,{spawnProcess=spawn,stopTimeoutMs=3000,killTimeoutMs=1000,startTimeoutMs=12000,retryDelayMs=500,maxRetryDelayMs=2000}={}){super();Object.assign(this,{ffmpeg,probe,spawnProcess,stopTimeoutMs,killTimeoutMs,startTimeoutMs,retryDelayMs,maxRetryDelayMs});this.active=false;this.recovering=false;}
 outputs(){return new Promise((resolve,reject)=>execFile(this.probe,[],{windowsHide:true,encoding:'utf8',timeout:8000},(e,s,err)=>{try{if(e)throw Error(err||e.message);resolve(JSON.parse(s));}catch(error){reject(error);}}));}
 async start(engine,config,output){
  if(this.run)throw Error('Захват уже запущен');
  const session=engine.session,state={queue:Promise.resolve(),stopping:false,attempt:0,retries:0,settled:false};this.run=state;this.active=true;
  return new Promise((resolve,reject)=>{
   state.reject=reject;
   const current=()=>this.run===state&&!state.stopping&&!state.failed&&engine.session===session&&!session.error;
   const fail=message=>{if(!current())return;state.failed=true;this.active=false;this.recovering=false;if(!state.settled){state.settled=true;reject(Error(message));}else this.emit('failure',message);};
   const launch=()=>{
    if(!current())return;
    const attempt=++state.attempt;let ready=false,stderr='',text='',finished=false,timedOut=false;
    let proc;try{proc=this.spawnProcess(this.ffmpeg,screenArguments(config,output,session.started),{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(error){fail(error.message);return;}
    this.child=state.proc=proc;
    const timeout=state.startTimer=setTimeout(()=>{timedOut=true;proc.kill();},this.startTimeoutMs);
    const mine=()=>current()&&state.attempt===attempt;
    proc.stdin.on('error',()=>{});
    proc.stdout.on('data',data=>{
     if(!mine())return;proc.stdout.pause();
     state.queue=state.queue.then(()=>{if(current())return engine.append('video',data);}).then(()=>proc.stdout.resume()).catch(error=>{proc.stdout.resume();fail(error.message);});
    });
    proc.stderr.on('data',data=>{
     if(!mine())return;const lines=data.toString();stderr=(stderr+lines).slice(-7000);text+=lines;let at;
     while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at).trim();text=text.slice(at+1);
      if(/^frame=\s*[1-9]\d*/.test(line)&&!ready){
       ready=true;clearTimeout(timeout);state.retries=0;
       if(this.recovering){this.recovering=false;this.emit('restored');}
       if(!state.settled){state.settled=true;resolve({width:config.width,height:config.resolution,frameRate:config.fps,mime:'video/mp4;codecs=avc1',backend:'desktop-duplication',encoder:'NVENC',scaled:config.width!==output.width||config.resolution!==output.height});}
      }
     }
    });
    const finish=async error=>{
     if(finished)return;finished=true;clearTimeout(timeout);if(!mine())return;
     this.child=state.proc=null;
     // close follows the last stdout chunk; drain it before a new encoder writes.
     await state.queue;if(!mine())return;
     if(desktopUnavailable(stderr,{running:state.settled||this.recovering})||timedOut&&this.recovering){
      if(!this.recovering){this.recovering=true;this.emit('recovering');}
      const delay=Math.min(this.maxRetryDelayMs,this.retryDelayMs*2**Math.min(state.retries++,4));
      state.retryTimer=setTimeout(launch,delay);return;
     }
     fail(error?.message||(timedOut?'Windows не запустила аппаратный захват экрана: ':'')+stderr.split(/\r?\n/).filter(l=>!/^\w+=/.test(l)).slice(-5).join(' ')||'Источник экрана остановлен');
    };
    proc.on('error',finish);proc.on('close',()=>finish());
   };
   launch();
  });
 }
 async stop(){const state=this.run;if(!state)return;if(state.stopPromise)return state.stopPromise;state.stopping=true;clearTimeout(state.retryTimer);clearTimeout(state.startTimer);if(!state.settled){state.settled=true;state.reject(Error('CAPTURE_START_CANCELLED'));}state.stopPromise=(async()=>{const proc=state.proc;if(proc&&proc.exitCode===null){await new Promise(resolve=>{let killTimer;const timer=setTimeout(()=>{proc.kill();killTimer=setTimeout(resolve,this.killTimeoutMs);},this.stopTimeoutMs);proc.once('close',()=>{clearTimeout(timer);clearTimeout(killTimer);resolve();});proc.stdin.write('q\n');});}await state.queue.catch(()=>{});if(this.run===state){this.active=false;this.recovering=false;this.child=null;this.run=null;}})();return state.stopPromise;}
}
module.exports={NativeScreen,screenArguments,desktopUnavailable};

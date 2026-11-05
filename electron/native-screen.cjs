const {spawn,execFile}=require('node:child_process'),{EventEmitter}=require('node:events');
function screenArguments(config,output,epoch,{duration,compatibility=false}={}){
 const fps=compatibility?Math.min(60,config.fps):config.fps,filter=`ddagrab=output_idx=${output.index}:framerate=${fps}:draw_mouse=1`,scale=config.width!==output.width||config.resolution!==output.height;
 // Quantise to the encoder's clock before clamping. Frames which arrive in
 // a burst can otherwise round to the same DTS even with passthrough enabled.
 const tick=`floor((RTCTIME-${Math.round(epoch*1000)})/(1000000*TB))`;
 const videoFilter=[`settb=1/${fps}`,`setpts='if(isnan(PREV_OUTPTS),${tick},max(${tick},PREV_OUTPTS+1))'`,...(compatibility?[...(scale?[`scale=${config.width}:${config.resolution}:flags=fast_bilinear`]:[]),'format=nv12']:scale?['hwdownload','format=bgra',`scale=${config.width}:${config.resolution}:flags=fast_bilinear`,'format=nv12']:[])].join(',');
 // Transport Stream accepts fresh encoder headers after a desktop switch. Keep
 // wall-clock timestamps so the segmenter and the uninterrupted audio stay aligned.
 const input=compatibility?['-copyts','-f','gdigrab','-framerate',String(fps),'-draw_mouse','1','-offset_x',String(output.x||0),'-offset_y',String(output.y||0),'-video_size',`${output.width}x${output.height}`,'-i','desktop']:['-init_hw_device',`d3d11va=capture:${output.adapter}`,'-filter_hw_device','capture','-copyts','-f','lavfi','-i',filter];
 return ['-hide_banner','-loglevel','warning','-nostats','-stats_period','0.2','-progress','pipe:2',...input,'-an','-vf',videoFilter,'-filter_threads','2','-c:v','h264_nvenc','-preset','p1','-tune','ull','-profile:v','high','-bf','0','-rc','vbr','-b:v',`${config.bitrate}M`,'-maxrate',`${config.bitrate}M`,'-bufsize',`${config.bitrate*2}M`,'-g',String(fps),'-rc-lookahead','0','-enc_time_base',`1:${fps}`,'-fps_mode','passthrough',...(duration?['-t',String(duration)]:[]),'-f','mpegts','-mpegts_copyts','1','-mpegts_flags','+resend_headers+initial_discontinuity','-muxdelay','0','-flush_packets','1','pipe:1'];
}
function desktopUnavailable(message,{running=false}={}){
 if(!/(?:ddagrab|DuplicateOutput|desktop duplication)/i.test(message))return false;
 // FFmpeg 6.1 maps DuplicateOutput's E_ACCESSDENIED to AVERROR(EPERM).
 // Its public input error then contains only "Operation not permitted", not
 // 80070005. Recognise that source-open failure as well as raw DXGI results.
 const accessDenied=/Desktop duplication access denied/i.test(message)||/Error (?:opening|initializing) input(?: files?)?[^\r\n]*(?:Operation not permitted|Permission denied)/i.test(message);
 const sourceEof=/\[Parsed_ddagrab_[^\]\r\n]*\]\s*EOF timestamp not reliable/i.test(message);
 const externalDemuxError=/\[in#\d+\/lavfi[^\]\r\n]*\]\s*Error (?:during demuxing|retrieving a packet from demuxer): Generic error in an external library/i.test(message);
 return accessDenied||/(?:887a0026|887a0028|887a0025|80070005|DXGI_ERROR_ACCESS_LOST|E_ACCESSDENIED)/i.test(message)||running&&(/887a0004/i.test(message)||sourceEof&&externalDemuxError);
}
class NativeScreen extends EventEmitter{
 constructor(ffmpeg,probe,{spawnProcess=spawn,stopTimeoutMs=3000,killTimeoutMs=1000,startTimeoutMs=12000,retryDelayMs=500,maxRetryDelayMs=2000,stallTimeoutMs=4000,desktopReady}={}){super();Object.assign(this,{ffmpeg,probe,spawnProcess,stopTimeoutMs,killTimeoutMs,startTimeoutMs,retryDelayMs,maxRetryDelayMs,stallTimeoutMs});this.desktopReady=desktopReady||(()=>!probe?Promise.resolve(true):new Promise(resolve=>execFile(probe,['--desktop-state'],{windowsHide:true,encoding:'utf8',timeout:3000},(error,s)=>{try{resolve(!error&&JSON.parse(s).available===true);}catch{resolve(false);}})));this.active=false;this.recovering=false;}
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
    const attempt=++state.attempt;let readyAt=0,stderr='',text='',sourceLost=false,finished=false,timedOut=false,stalled=false,lastFrame=0,lastActivity=Date.now();
    let proc;try{proc=this.spawnProcess(this.ffmpeg,screenArguments(config,output,session.started,{compatibility:!!state.compatibility}),{windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(error){fail(error.message);return;}
    this.child=state.proc=proc;
    const timeout=state.startTimer=setTimeout(()=>{timedOut=true;proc.kill();},this.startTimeoutMs);
    const watchdog=state.watchdog=setInterval(()=>{if(mine()&&readyAt&&!stalled&&Date.now()-lastActivity>this.stallTimeoutMs){stalled=true;this.emit('stalled');proc.kill();}},Math.max(5,Math.min(1000,this.stallTimeoutMs/3)));
    const mine=()=>current()&&state.attempt===attempt;
    proc.stdin.on('error',()=>{});
    proc.stdout.on('data',data=>{
     if(!mine())return;lastActivity=Date.now();proc.stdout.pause();
     state.queue=state.queue.then(()=>{if(current())return engine.append('video',data);}).then(()=>proc.stdout.resume()).catch(error=>{proc.stdout.resume();fail(error.message);});
    });
    proc.stderr.on('data',data=>{
     if(!mine())return;text+=data.toString();let at;
     while((at=text.indexOf('\n'))>=0){const line=text.slice(0,at).trim();text=text.slice(at+1);
      if(!/^\w+=/.test(line)){
       stderr=(stderr+line+'\n').slice(-7000);
       sourceLost ||= desktopUnavailable(stderr,{running:state.settled||this.recovering});
      }
      if(/^frame=\s*[1-9]\d*/.test(line)&&!readyAt){
       readyAt=Date.now();clearTimeout(timeout);
       this.actual={width:config.width,height:config.resolution,frameRate:state.compatibility?Math.min(60,config.fps):config.fps,mime:'video/mp4;codecs=avc1',backend:state.compatibility?'desktop-compatibility':'desktop-duplication',encoder:'NVENC',scaled:config.width!==output.width||config.resolution!==output.height};this.emit('actual',this.actual);
       if(this.recovering){this.recovering=false;this.emit('restored');}
       if(!state.settled){state.settled=true;resolve(this.actual);}
      }
      const progress=line.match(/^frame=\s*(\d+)/);if(progress&&Number(progress[1])>lastFrame){
       lastFrame=Number(progress[1]);lastActivity=Date.now();
       if(readyAt&&lastActivity-readyAt>=15000)state.retries=0;
      }
     }
     text=text.slice(-7000);
    });
    const finish=async error=>{
     if(finished)return;finished=true;clearTimeout(timeout);clearInterval(watchdog);if(!mine())return;
     this.child=state.proc=null;
     // close follows the last stdout chunk; drain it before a new encoder writes.
     await state.queue;if(!mine())return;
     if(text.trim()&&!/^\w+=/.test(text))stderr=(stderr+text).slice(-7000);
     if(stalled||timedOut||sourceLost||desktopUnavailable(stderr,{running:state.settled||this.recovering})||state.compatibility&&/gdigrab[\s\S]*(?:access denied|Permission denied|Operation not permitted|Failed to capture)/i.test(stderr)){
      if(!this.recovering){this.recovering=true;this.emit('recovering');}
      if(stalled)state.retries=Math.max(2,state.retries);state.retries++;
      const retry=()=>{const delay=Math.min(this.maxRetryDelayMs,this.retryDelayMs*2**Math.min(state.retries,4));state.retryTimer=setTimeout(async()=>{if(!current())return;let available=false;try{available=await this.desktopReady();}catch{}if(!current())return;if(!available){retry();return;}if(state.retries>=3&&!state.compatibility){state.compatibility=true;this.emit('compatibility');}launch();},delay);};retry();return;
     }
     fail(error?.message||(timedOut?'Windows не запустила аппаратный захват экрана: ':'')+stderr.split(/\r?\n/).filter(l=>!/^\w+=/.test(l)).slice(-5).join(' ')||'Источник экрана остановлен');
    };
    proc.on('error',finish);proc.on('close',()=>finish());
   };
   launch();
  });
 }
 async stop(){const state=this.run;if(!state)return;if(state.stopPromise)return state.stopPromise;state.stopping=true;clearTimeout(state.retryTimer);clearTimeout(state.startTimer);clearInterval(state.watchdog);if(!state.settled){state.settled=true;state.reject(Error('CAPTURE_START_CANCELLED'));}state.stopPromise=(async()=>{const proc=state.proc;if(proc&&proc.exitCode===null){await new Promise(resolve=>{let killTimer;const timer=setTimeout(()=>{proc.kill();killTimer=setTimeout(resolve,this.killTimeoutMs);},this.stopTimeoutMs);proc.once('close',()=>{clearTimeout(timer);clearTimeout(killTimer);resolve();});proc.stdin.write('q\n');});}await state.queue.catch(()=>{});if(this.run===state){this.active=false;this.recovering=false;this.child=null;this.run=null;}})();return state.stopPromise;}
}
module.exports={NativeScreen,screenArguments,desktopUnavailable};

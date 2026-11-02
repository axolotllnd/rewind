const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');const {randomUUID}=require('node:crypto');
const {selectSegments}=require('./config.cjs');
function replayBounds(session,end,kind='replay'){return {start:kind==='record'?session.recordStart:Math.max(0,session.lastReplayAt??0,end-session.config.replaySeconds),end};}
class CaptureEngine{
 constructor(ffmpeg,root,onError,onEvent=()=>{}){this.ffmpeg=ffmpeg;this.root=root;this.onError=onError;this.onEvent=onEvent;this.session=null;this.jobs=new Set();this.saveQueue=Promise.resolve();}
 async start(tracks,config){
  if(this.session)throw new Error('Захват уже запущен');
  const dir=path.join(this.root,randomUUID());await fsp.mkdir(dir,{recursive:true});
  const s={id:randomUUID(),dir,config,started:Date.now(),inputs:[],recordStart:null,lastReplayAt:null,error:null,pins:0};this.session=s;
  try{for(const t of tracks){
   if(!/^(video|audio[1-6])$/.test(t.id))throw new Error('Неверный поток');
   const folder=path.join(dir,t.id);await fsp.mkdir(folder);
   const args=['-hide_banner','-loglevel','warning',...(t.preserveTimestamps?['-copyts']:[]),'-fflags','+genpts','-probesize','32768','-analyzeduration','500000',...(t.inputFormat==='mpegts'?['-f','mpegts']:[]),'-i','pipe:0','-map','0','-c','copy','-f','segment','-segment_time','1','-reset_timestamps','1','-segment_list',path.join(folder,'list.csv'),'-segment_list_type','csv','-segment_format','matroska','-segment_format_options','cluster_time_limit=50:flush_packets=1',path.join(folder,'part-%08d.mkv')];
   const proc=spawn(this.ffmpeg,args,{windowsHide:true,stdio:['pipe','ignore','pipe']});
   const inp={...t,folder,proc,stderr:'',pending:0,closed:false,started:s.started,byteCount:0};s.inputs.push(inp);
   proc.stderr.on('data',d=>{inp.stderr=(inp.stderr+d).slice(-6000);});
   proc.stdin.on('error',()=>{});
   proc.on('error',e=>this.fail(s,e.message));proc.on('exit',code=>{inp.closed=true;if(code&&this.session===s)this.fail(s,`Обработка ${t.id}: ${inp.stderr.slice(-500)}`);});
  }}catch(e){await this.stop();throw e;}
  this.timer=setInterval(()=>this.prune().catch(e=>{if(this.session===s)this.fail(s,e.message);}),1000);return s.id;
 }
 fail(s,message){if(s.error)return;s.error=message;this.onError(message);}
 async append(id,data){const s=this.session;if(!s||s.error)throw new Error(s?.error||'Захват остановлен');const t=s.inputs.find(t=>t.id===id);if(!t||t.closed)throw new Error('Поток закрыт');const b=Buffer.from(data);t.pending+=b.length;if(t.pending>32*1024*1024){t.pending-=b.length;throw new Error('Диск не успевает записывать. Уменьшите качество.');}try{await new Promise((res,rej)=>t.proc.stdin.write(b,e=>e?rej(e):res()));}finally{t.pending-=b.length;}}
 async segments(t,{closedOnly=false}={}){
  let rows=[];try{rows=(await fsp.readFile(path.join(t.folder,'list.csv'),'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>{const m=line.match(/^"?([^",]+)"?,([\d.-]+),([\d.-]+)/);return m?{file:path.join(t.folder,path.basename(m[1])),start:+m[2]+(t.offset||0),end:+m[3]+(t.offset||0)}:null;}).filter(Boolean);}catch{}
  const names=(await fsp.readdir(t.folder)).filter(n=>/^part-\d+\.mkv$/.test(n)).sort();
  const latestEnd=rows.at(-1)?.end||t.offset||0;const existing=new Set(names);rows=rows.filter(r=>existing.has(path.basename(r.file)));
  const last=names.at(-1);if(!closedOnly&&last&&!rows.some(r=>path.basename(r.file)===last)){rows.push({file:path.join(t.folder,last),start:latestEnd,end:(Date.now()-(t.started||this.session?.started||Date.now()))/1000});}
  return rows;
 }
 async prune(){if(this.pruning)return this.pruning;this.pruning=this.pruneOnce();try{return await this.pruning;}finally{this.pruning=null;}}
 async pruneOnce(){const s=this.session;if(!s||s.pins||s.error)return;const cutoff=Math.min(Math.max((Date.now()-s.started)/1000-s.config.replaySeconds,s.lastReplayAt??0),s.recordStart??Infinity);for(const t of s.inputs){for(const seg of (await this.segments(t)).slice(0,-1).filter(seg=>seg.end<=cutoff)){await fsp.unlink(seg.file).catch(()=>{});}}}
 async info(){const s=this.session;if(!s)return {active:false,bufferBytes:0,bufferSeconds:0};let bytes=0;for(const t of s.inputs){for(const name of await fsp.readdir(t.folder)){if(name.endsWith('.mkv'))bytes+=(await fsp.stat(path.join(t.folder,name)).catch(()=>({size:0}))).size;}}const parts=await this.segments(s.inputs[0]);const elapsed=(Date.now()-s.started)/1000;return {active:true,recording:s.recordStart!==null,elapsed,recordSeconds:s.recordStart===null?0:elapsed-s.recordStart,bufferBytes:bytes,bufferSeconds:Math.max(0,Math.min(s.config.replaySeconds,elapsed-(s.lastReplayAt??0),parts.length?elapsed-parts[0].start:0)),lastReplayAt:s.lastReplayAt,error:s.error};}
 record(){if(!this.session)throw new Error('Сначала включите захват');this.session.recordStart=(Date.now()-this.session.started)/1000;}
 async waitForCoverage(s,end){const deadline=Date.now()+(this.coverageTimeoutMs??10000);while(true){if(s.error)throw new Error(s.error);const parts=await Promise.all(s.inputs.map(t=>this.segments(t,{closedOnly:true})));if(parts.every(rows=>rows.some(p=>p.end>=end-.001)))return parts;if(s.stopped||Date.now()>=deadline)throw new Error('Запись ещё не дошла до момента нажатия. Повтор не сброшен — попробуй сохранить ещё раз.');await new Promise(resolve=>setTimeout(resolve,50));}}
 save(outputDir,kind='replay',options={}){
  const s=this.session;if(!s||s.error)return Promise.reject(new Error(s?.error||'Включите буфер повтора'));
  const requestedAt=options.requestedAt??Date.now();if(!Number.isFinite(requestedAt)||requestedAt<s.started||requestedAt>Date.now()+1000)return Promise.reject(new Error('Invalid replay timestamp'));
  s.pins++;const task=this.saveQueue.then(()=>this.saveOne(s,outputDir,kind,{...options,requestedAt}));this.saveQueue=task.catch(()=>{});
  return task.finally(async()=>{s.pins--;if(s.stopped&&!s.pins&&!s.preserve)await fsp.rm(s.dir,{recursive:true,force:true});});
 }
 async saveOne(s,outputDir,kind,request){
  const began=Date.now();
  if(s.error)throw new Error(s.error);if(this.pruning)await this.pruning;
  const {start,end}=replayBounds(s,(request.requestedAt-s.started)/1000,kind);
  if(start===null||end-start<.1)throw new Error('Ещё нет нового материала для повтора. Подождите немного.');
  if(request.beforeSnapshot)await request.beforeSnapshot();
  const snapshot=await this.waitForCoverage(s,end),coveredAt=Date.now();
  const job=path.join(this.root,`export-${randomUUID()}`);await fsp.mkdir(job,{recursive:true});
  let partial;
  try{
   const videoSegments=selectSegments(snapshot[0],start,end);if(!videoSegments.length)throw new Error('Буфер ещё наполняется');
   const alignedStart=Math.max(start,videoSegments[0].start),videoTrim=alignedStart-videoSegments[0].start;
   if(end-alignedStart<.05)throw new Error('Буфер ещё наполняется');
   const format=s.config.outputFormat||'mp4',sourceCodec=await this.videoCodec(s,videoSegments[0].file),fast=format==='mp4'&&['h264','vp9'].includes(sourceCodec);
   if(format==='mp4'&&!fast)throw new Error('Этот кодек не поддерживается в MP4. Выберите H.264, VP9 или формат MKV/WebM.');
   const args=['-hide_banner','-loglevel','error','-y','-filter_threads','1','-filter_complex_threads','1'];let inputCount=0;const audioOffsets=[];
   for(const [trackIndex,t] of s.inputs.entries()){const segments=selectSegments(snapshot[trackIndex],alignedStart,end);if(!segments.length)throw new Error(`Нет данных: ${t.label}`);
    // Closed segments are immutable and pinned until this job finishes. Read them in place.
    const list=path.join(job,`${t.id}.txt`);await fsp.writeFile(list,segments.map((seg,i)=>`file '${seg.file.replaceAll('\\','/').replaceAll("'","'\\''")}'\nduration ${Math.max(.001,(segments[i+1]?.start??seg.end)-seg.start)}`).join('\n'));
    if(t.id!=='video')audioOffsets.push(segments[0].start-alignedStart);
    if(fast){const trim=alignedStart-segments[0].start;if(trim<0)args.push('-itsoffset',String(-trim));args.push('-ss',String(Math.max(0,trim)));}
    args.push('-threads','2','-f','concat','-safe','0','-i',list);inputCount++;
   }
   args.push('-map','0:v:0');for(let i=1;i<inputCount;i++){args.push('-map',`${i}:a:0`);if(!fast){const offset=audioOffsets[i-1];args.push('-filter:a:'+String(i-1),`atrim=start=${Math.max(0,-offset)},asetpts=PTS-STARTPTS${offset>0?`,adelay=${Math.round(offset*1000)}:all=1`:''}`);}args.push('-metadata:s:a:'+String(i-1),`title=${s.inputs[i].label}`,'-metadata:s:a:'+String(i-1),`handler_name=${s.inputs[i].label}`);}
   const filename=`REWIND_${kind==='record'?'REC':'CLIP'}_${new Date(request.requestedAt).toISOString().replace(/[:.]/g,'-')}_${randomUUID().slice(0,6)}.${format}`;await fsp.mkdir(outputDir,{recursive:true});const output=path.join(outputDir,filename);
   // Write once on the destination volume; rename publishes only a complete clip.
   partial=path.join(outputDir,`.rewind-${randomUUID()}.partial.${format}`);
   args.push('-t',String(end-alignedStart));let encoder='copy';
   if(!fast&&videoTrim>.0001){encoder=format==='webm'?'libvpx-vp9':'libx264';args.push('-filter:v',`trim=start=${videoTrim},setpts=PTS-STARTPTS`);}
   const tail=fast?['-c','copy','-use_editlist','1','-avoid_negative_ts','disabled',partial]:[...this.encodingOptions(encoder),'-c:a','libopus','-b:a','192k','-threads:a','1','-avoid_negative_ts','make_zero',partial];
   const processingAt=Date.now();await this.run([...args,...tail],Math.max(120000,(end-alignedStart)*4000+30000));
   const size=(await fsp.stat(partial)).size;if(size<1000)throw new Error('Файл записи пуст');await fsp.rename(partial,output);partial=null;
   if(kind==='record')s.recordStart=null;else s.lastReplayAt=end;
   const performance={mode:fast?'stream-copy':'bounded-encode',format,sourceCodec,encoder,coverageMs:coveredAt-began,processingMs:Date.now()-processingAt,totalMs:Date.now()-began,inputCopiedBytes:0,size};this.onEvent({event:'save-performance',...performance});
   return {id:randomUUID(),name:filename,path:output,createdAt:Date.now(),duration:end-alignedStart,startTime:s.started+alignedStart*1000,endTime:request.requestedAt,tracks:inputCount-1,kind,resolution:s.config.resolution,fps:s.config.fps,size,performance};
  }finally{if(partial)await fsp.unlink(partial).catch(()=>{});await fsp.rm(job,{recursive:true,force:true});}
 }
 async videoCodec(s,file){if(!s.codecPromise)s.codecPromise=(async()=>{const stderr=await this.run(['-hide_banner','-i',file],10000,{probe:true});const codec=stderr.match(/Video:\s*([^,\s]+)/)?.[1];if(!codec)throw new Error('Не удалось определить кодек буфера');return codec;})();return s.codecPromise;}
 encodingOptions(encoder){if(encoder==='copy')return ['-c:v','copy'];if(encoder==='libvpx-vp9')return ['-c:v',encoder,'-deadline','realtime','-cpu-used','8','-row-mt','1','-threads:v','2','-crf','24','-b:v','0'];return ['-c:v','libx264','-preset','ultrafast','-threads:v','2','-crf','18'];}
 run(args,timeoutMs=120000,{probe=false}={}){return new Promise((resolve,reject)=>{const p=spawn(this.ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});this.jobs.add(p);try{os.setPriority(p.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}let err='';const timer=setTimeout(()=>p.kill(),timeoutMs);p.stderr.on('data',d=>err=(err+d).slice(-8000));p.on('error',error=>{clearTimeout(timer);this.jobs.delete(p);reject(error);});p.on('close',code=>{clearTimeout(timer);this.jobs.delete(p);code===0||probe&&code===1?resolve(err):reject(new Error(err.slice(-700)||'Не удалось сохранить видео'));});});}
 async stop({preserve=false}={}){clearInterval(this.timer);const s=this.session;this.session=null;if(!s)return;s.stopped=true;s.preserve=preserve;await Promise.all(s.inputs.map(t=>new Promise(resolve=>{if(t.closed)return resolve();const timeout=setTimeout(()=>{t.proc.kill();resolve();},5000);t.proc.once('exit',()=>{clearTimeout(timeout);resolve();});t.proc.stdin.end();})));if(!s.pins&&!preserve)await fsp.rm(s.dir,{recursive:true,force:true});}
}
module.exports={CaptureEngine,replayBounds};

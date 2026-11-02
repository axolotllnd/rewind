const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),{EventEmitter}=require('node:events'),{createHash,randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const repository='https://github.com/axolotllnd/rewind',latestApi='https://api.github.com/repos/axolotllnd/rewind/releases/latest';
class MaintenanceError extends Error{constructor(code){super(code);this.code=code;}}
function versionParts(value){const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);if(!m||m.slice(1).some(n=>!Number.isSafeInteger(+n)))throw new MaintenanceError('invalid-release');return m.slice(1).map(Number);}
function newerVersion(next,current){const a=versionParts(next),b=versionParts(current);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
function releaseInstaller(release){
 if(release?.draft||release?.prerelease||!Array.isArray(release?.assets))throw new MaintenanceError('invalid-release');
 const version=versionParts(release.tag_name).join('.'),name=`REWIND-${version}-Setup.exe`,asset=release.assets.find(a=>a.name===name),url=`${repository}/releases/download/${release.tag_name}/${name}`;
 if(!asset||asset.browser_download_url!==url||asset.state!=='uploaded'||!Number.isSafeInteger(asset.size)||asset.size<2||asset.size>1024**3||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw new MaintenanceError('invalid-release');
 return {version,name,url,size:asset.size,sha256:asset.digest.slice(7).toLowerCase(),publishedAt:release.published_at||null};
}
async function trustedDownload(fetchRequest,url,options){
 for(let redirects=0;redirects<6;redirects++){
  const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))throw new MaintenanceError('invalid-release');
  const response=await fetchRequest(url,{...options,redirect:'manual'});
  if(![301,302,303,307,308].includes(response.status))return response;
  const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new MaintenanceError('download');url=new URL(location,url).href;
 }
 throw new MaintenanceError('download');
}
async function verifyInstaller(file,asset){
 if((await fsp.stat(file)).size!==asset.size)throw new MaintenanceError('checksum');
 const hash=createHash('sha256');let header=Buffer.alloc(0);for await(const chunk of fs.createReadStream(file)){hash.update(chunk);if(header.length<2)header=Buffer.concat([header,chunk.subarray(0,2-header.length)]);}
 if(header.toString('ascii')!=='MZ'||hash.digest('hex')!==asset.sha256)throw new MaintenanceError('checksum');
}
class AppUpdater extends EventEmitter{
 constructor({version,cacheDir,installed=false,platform=process.platform,fetchRequest=globalThis.fetch}){super();Object.assign(this,{version,cacheDir,installed,platform,fetchRequest});this.state={phase:'idle',currentVersion:version,version:null,progress:0,received:0,total:0,error:null,installed:installed&&platform==='win32'};}
 status(){return {...this.state};}
 set(patch){Object.assign(this.state,patch);this.emit('state',this.status());return this.status();}
 async cleanup(){for(const name of await fsp.readdir(this.cacheDir).catch(()=>[])){const old=/^REWIND-(\d+\.\d+\.\d+)-Setup\.exe$/.exec(name);if(/^[a-f0-9-]{36}\.partial$/.test(name)||old&&!newerVersion(old[1],this.version))await fsp.unlink(path.join(this.cacheDir,name)).catch(()=>{});}}
 check(){if(this.checking)return this.checking;if(['downloading','installing'].includes(this.state.phase))return Promise.resolve(this.status());this.checking=this.checkOnce().finally(()=>{this.checking=null;});return this.checking;}
 async checkOnce(){
  const previous=this.status(),previousFile=this.file,previousAsset=this.asset;this.set({phase:'checking',error:null});try{
   const response=await this.fetchRequest(latestApi,{headers:{Accept:'application/vnd.github+json','User-Agent':'REWIND/'+this.version},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw new MaintenanceError([403,429].includes(response.status)?'rate-limit':'network');
   const text=await response.text();if(text.length>1024*1024)throw new MaintenanceError('invalid-release');
   let data;try{data=JSON.parse(text);}catch{throw new MaintenanceError('invalid-release');}
   const asset=releaseInstaller(data);this.asset=asset;
   if(!newerVersion(asset.version,this.version)){this.file=null;return this.set({phase:'current',version:null,progress:0,total:0});}
   const candidate=path.join(this.cacheDir,asset.name);let cached=false;try{await verifyInstaller(candidate,asset);this.file=candidate;this.downloadedHash=asset.sha256;cached=true;}catch{this.file=null;}
   return this.set({phase:cached?'ready':'available',version:asset.version,total:asset.size,progress:cached?1:0});
  }catch(error){
   if(previous.phase==='ready'&&previousFile&&previousAsset){try{await verifyInstaller(previousFile,previousAsset);this.file=previousFile;this.asset=previousAsset;return this.set({...previous,phase:'ready',error:error.code||'network'});}catch{this.file=null;return this.set({phase:'error',error:'checksum'});}}
   return this.set({phase:'error',error:error.code||'network'});
  }
 }
 async download(){
  if(!this.state.installed)throw new MaintenanceError('not-installed');
  if(this.state.phase==='ready')return this.status();if(this.downloading)return this.downloading;
  if(this.state.phase!=='available')throw new MaintenanceError('busy');
  if(!this.asset||!newerVersion(this.asset.version,this.version))throw new MaintenanceError('no-update');
  this.downloading=this.downloadOnce(this.asset).finally(()=>{this.downloading=null;});return this.downloading;
 }
 async downloadOnce(asset){
  this.controller=new AbortController();this.cancelled=false;this.set({phase:'downloading',error:null,progress:0,received:0,total:asset.size});
  const partial=path.join(this.cacheDir,randomUUID()+'.partial');let handle;const timer=setTimeout(()=>this.controller.abort(),10*60*1000);
  try{
   await fsp.mkdir(this.cacheDir,{recursive:true});
   const response=await trustedDownload(this.fetchRequest,asset.url,{signal:this.controller.signal,headers:{Accept:'application/octet-stream'}});
   if(!response.ok||!response.body)throw new MaintenanceError('download');
   const length=response.headers.get('content-length');if(length!==null&&+length!==asset.size)throw new MaintenanceError('checksum');
   handle=await fsp.open(partial,'wx');let received=0,lastProgress=0;
   for await(const chunk of response.body){
    if(this.controller.signal.aborted)throw new MaintenanceError('download');received+=chunk.length;if(received>asset.size)throw new MaintenanceError('checksum');await handle.writeFile(chunk);
    if(Date.now()-lastProgress>100){this.set({received,progress:Math.min(.99,received/asset.size)});lastProgress=Date.now();}
   }
   await handle.close();handle=null;await verifyInstaller(partial,asset);if(this.controller.signal.aborted)throw new MaintenanceError('download');
   const file=path.join(this.cacheDir,asset.name);await fsp.rename(partial,file);this.file=file;this.downloadedHash=asset.sha256;
   return this.set({phase:'ready',error:null,received:asset.size,progress:1});
  }catch(error){this.file=null;return this.set({phase:'available',progress:0,error:this.cancelled?null:error.code||'download'});}
  finally{clearTimeout(timer);await handle?.close().catch(()=>{});await fsp.unlink(partial).catch(()=>{});this.controller=null;}
 }
 cancel(){if(this.state.phase==='downloading'){this.cancelled=true;this.controller?.abort();}return this.status();}
 async installPlan(directory,language){
  if(!this.state.installed)throw new MaintenanceError('not-installed');if(this.state.phase!=='ready'||!this.file)throw new MaintenanceError('no-update');
  try{await verifyInstaller(this.file,this.asset);}catch{this.file=null;this.set({phase:'available',progress:0,error:'checksum'});throw new MaintenanceError('checksum');}
  return {exe:this.file,args:['/SP-','/SILENT','/NORESTART','/NOCLOSEAPPLICATIONS','/NORESTARTAPPLICATIONS','/REWINDUPDATE=1','/DIR='+directory,'/LANG='+(language==='en'?'english':'russian')]};
 }
}
function uninstallPlan({installed,platform=process.platform,directory}){
 if(!installed||platform!=='win32')throw new MaintenanceError('not-installed');
 const exe=path.join(directory,'unins000.exe');if(!fs.existsSync(exe)||!fs.existsSync(path.join(directory,'unins000.dat')))throw new MaintenanceError('no-uninstaller');
 return {exe,args:['/NORESTART','/REWINDREMOVE=1']};
}
function launchDetached(plan){return new Promise((resolve,reject)=>{const child=spawn(plan.exe,plan.args,{detached:true,stdio:'ignore',shell:false,windowsHide:false,cwd:path.dirname(plan.exe)});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});}
class MaintenanceHandoff{
 constructor({prepare,launch=launchDetached,finish,rollback=async()=>{},onBusy=()=>{}}){Object.assign(this,{prepare,launch,finish,rollback,onBusy});this.busy=false;}
 async run(plan){
  if(this.busy)throw new MaintenanceError('busy');this.busy=true;this.onBusy(true);
  try{await this.prepare();await this.launch(plan);await this.finish();}
  catch(error){await this.rollback();throw error;}
  finally{this.busy=false;this.onBusy(false);}
 }
 }
async function prepareCaptureShutdown({engine,saver,nativeScreen,captureWorker,audio}){
 try{await saver.waitForIdle({failOnError:true});if(engine.session&&engine.session.recordStart!==null)await saver.save('record',Date.now(),'maintenance');await saver.waitForIdle({failOnError:true});}catch{throw new MaintenanceError('save-failed');}
 await nativeScreen.stop();await captureWorker.stop();audio.stop();await engine.stop();
}
module.exports={AppUpdater,MaintenanceHandoff,MaintenanceError,releaseInstaller,newerVersion,verifyInstaller,uninstallPlan,prepareCaptureShutdown,repository};

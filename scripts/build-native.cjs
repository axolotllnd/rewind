const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
fs.mkdirSync('assets/native',{recursive:true});
function build(name,sources,references=[]){
 const args=['/nologo','/optimize+','/platform:x64','/target:winexe',
  '/out:'+path.resolve('assets/native',name+'.exe'),
  ...references.map(reference=>'/r:'+reference),...sources.map(source=>path.resolve('native',source+'.cs'))];
 const result=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error(result.error?.message||result.stdout+result.stderr);
 console.log(name+' built without a console subsystem');
}
build('AudioBridge',['AudioBridge','AudioTimeline']);
build('ScreenProbe',['ScreenProbe'],['System.Web.Extensions.dll']);
build('HotkeyBridge',['HotkeyBridge'],['System.Web.Extensions.dll','System.Windows.Forms.dll']);

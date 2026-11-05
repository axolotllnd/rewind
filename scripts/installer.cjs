const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {buildIncludes,fileHash}=require('./update-package.cjs');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const candidates=[process.env.ISCC,path.join(root,'work/tools/inno/ISCC.exe'),path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Inno Setup 6/ISCC.exe')].filter(Boolean);
const compiler=candidates.find(file=>fs.existsSync(file));
if(!compiler)throw Error('Install Inno Setup 6.7.4 or later and set ISCC to the full path to ISCC.exe.');
const outputs=path.join(root,'outputs');
const target=path.join(outputs,'REWIND-'+version);
if(!fs.existsSync(path.join(target,'REWIND.exe')))throw Error('Run the build and package steps first.');

function compareVersions(a,b){
 const left=a.split('.').map(Number),right=b.split('.').map(Number);
 for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]-right[i];
 return 0;
}
const previous=fs.readdirSync(outputs,{withFileTypes:true})
 .filter(entry=>entry.isDirectory()&&/^REWIND-\d+\.\d+\.\d+$/.test(entry.name))
 .map(entry=>entry.name.slice(7)).filter(value=>compareVersions(value,version)<0)
 .sort((a,b)=>compareVersions(b,a));
const from=process.argv[2]||previous[0];
if(from&&!previous.includes(from))throw Error('The update requires a previous portable build in outputs/REWIND-'+from);
const baseline=value=>path.join(outputs,'REWIND-'+value);
// Use the verified previous portable as the delta base. Older packages are
// consulted only for obsolete frontend assets left by earlier installations.
const oldFolders=previous.map(baseline);
const includes=buildIncludes({
 target,previous:oldFolders,base:from?baseline(from):null,
 output:path.join(root,'work/update-package-'+version)
});
function run(exe,args){
 const result=spawnSync(exe,args,{cwd:root,stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error(result.error?.message||'Installer build failed with exit code '+result.status);
}
function compile(...defines){
 run(compiler,['/Qp','/DAppVersion='+version,'/DCleanupScript='+includes.cleanup,...defines,path.join(root,'installer/rewind.iss')]);
}
function checksum(name){
 const file=path.join(outputs,name);
 fs.writeFileSync(file+'.sha256',fileHash(file)+'  '+name+'\n');
 console.log('Installer: '+file+' ('+fs.statSync(file).size+' bytes)');
}
run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'installer-art.ps1')]);
compile();
checksum(`REWIND-${version}-Setup.exe`);
if(from){
 compile('/DUpdateFrom='+from,'/DUpdateFiles='+includes.updateFiles,'/DUpdateChecks='+includes.updateChecks);
 checksum(`REWIND-${from}-to-${version}-Update.exe`);
 console.log(`Delta: ${includes.changed} changed, ${includes.kept} kept, ${includes.obsolete} obsolete package paths`);
}

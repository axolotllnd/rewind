const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const candidates=[process.env.ISCC,path.join(root,'work/tools/inno/ISCC.exe'),path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Inno Setup 6/ISCC.exe')].filter(Boolean);
const compiler=candidates.find(p=>fs.existsSync(p));if(!compiler)throw Error('Install Inno Setup 6.7.4 or later and set ISCC to the full path to ISCC.exe.');
if(!fs.existsSync(path.join(root,'outputs','REWIND-'+version,'REWIND.exe')))throw Error('Run the build and package steps first.');
for(const [exe,args] of [['powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'installer-art.ps1')]], [compiler,['/Qp','/DAppVersion='+version,path.join(root,'installer/rewind.iss')]]]){const r=spawnSync(exe,args,{cwd:root,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
const file=path.join(root,'outputs',`REWIND-${version}-Setup.exe`),hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(file+'.sha256',hash+'  '+path.basename(file)+'\n');console.log('Installer: '+file);

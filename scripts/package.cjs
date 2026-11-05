const fs=require('node:fs');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {configureBackgroundExecutable}=require('./windows-executable.cjs');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,out=path.join(root,'outputs','REWIND-'+version);
fs.mkdirSync(out,{recursive:true});
const electronDir=path.dirname(require('electron'));
fs.cpSync(electronDir,out,{recursive:true});
const sourceExe=path.join(out,'electron.exe'),targetExe=path.join(out,'REWIND.exe');if(fs.existsSync(targetExe))fs.unlinkSync(targetExe);fs.renameSync(sourceExe,targetExe);
const rcedit=process.env.RCEDIT||path.join(root,'work/tools/rcedit-x64.exe');
if(!fs.existsSync(rcedit))throw Error('Install Electron rcedit x64 2.0.0 in work/tools or set RCEDIT.');
execFileSync(rcedit,[targetExe,'--set-version-string','FileDescription','REWIND','--set-version-string','ProductName','REWIND',
 '--set-version-string','InternalName','REWIND','--set-version-string','OriginalFilename','REWIND.exe',
 '--set-file-version',version,'--set-product-version',version,'--set-icon',path.join(root,'assets/icon.ico')],{windowsHide:true});
const appDir=path.join(out,'resources','app');fs.mkdirSync(appDir,{recursive:true});
for(const dir of ['dist','electron','assets'])if(fs.existsSync(path.join(root,dir)))fs.cpSync(path.join(root,dir),path.join(appDir,dir),{recursive:true});
fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'rewind',productName:'REWIND',version,main:'electron/main.cjs'},null,2));
const ffmpeg=path.join(out,'resources','ffmpeg.exe');
fs.copyFileSync(require('ffmpeg-static'),ffmpeg);
configureBackgroundExecutable(ffmpeg);
const notices=path.join(out,'THIRD-PARTY-NOTICES');fs.mkdirSync(notices,{recursive:true});
const ffmpegDir=path.dirname(require('ffmpeg-static'));for(const filename of ['ffmpeg.exe.LICENSE','ffmpeg.exe.README','LICENSE'])fs.copyFileSync(path.join(ffmpegDir,filename),path.join(notices,'ffmpeg-'+filename));
for(const name of ['react','react-dom','@phosphor-icons/react','@fontsource/manrope','@fontsource/ibm-plex-mono']){const dir=fs.realpathSync(path.join(root,'node_modules',name));for(const file of fs.readdirSync(dir).filter(f=>/^(license|ofl|copying)/i.test(f)))fs.copyFileSync(path.join(dir,file),path.join(notices,name.replaceAll('/','-')+'-'+file));}
fs.copyFileSync(path.join(root,'README.md'),path.join(out,'ПРОЧИТАЙ МЕНЯ.md'));
console.log('Portable app: '+targetExe);

for(const name of ['LICENSE','THIRD_PARTY.md'])if(fs.existsSync(path.join(root,name)))fs.copyFileSync(path.join(root,name),path.join(out,name));

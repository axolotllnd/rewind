const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {AppUpdater,MaintenanceHandoff,releaseInstaller,newerVersion,uninstallPlan,prepareCaptureShutdown}=require('../electron/app-maintenance.cjs');
const bytes=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(600,29)]),sha=createHash('sha256').update(bytes).digest('hex');
function release(version='0.2.10'){const name=`REWIND-${version}-Setup.exe`;return {tag_name:'v'+version,draft:false,prerelease:false,assets:[{name,state:'uploaded',browser_download_url:`https://github.com/axolotllnd/rewind/releases/download/v${version}/${name}`,digest:'sha256:'+sha,size:bytes.length}]};}
async function fixture(t,fetchRequest){const root=await fs.mkdtemp(path.resolve('work/app-update-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return new AppUpdater({version:'0.2.9',cacheDir:root,installed:true,platform:'win32',fetchRequest});}
test('updates compare numeric stable versions and only accept this repository, an exact installer and SHA-256',()=>{
 assert.equal(newerVersion('0.2.10','0.2.9'),true);assert.equal(newerVersion('0.2.9','0.2.10'),false);assert.equal(newerVersion('0.2.9','0.2.9'),false);
 assert.equal(releaseInstaller(release()).version,'0.2.10');
 for(const edit of [r=>r.prerelease=true,r=>r.draft=true,r=>r.tag_name='../../payload',r=>r.assets[0].digest=null,r=>r.assets[0].browser_download_url='https://evil.example/Setup.exe',r=>r.assets[0].browser_download_url=r.assets[0].browser_download_url.replace('axolotllnd','other'),r=>r.assets[0].name='setup.exe',r=>r.assets[0].size=2**40]){const r=release();edit(r);assert.throws(()=>releaseInstaller(r));}
 for(const value of ['0.2.9-beta.1','01.2.3','1.2.3.4','v1.2','999999999999999999.0.1'])assert.throws(()=>newerVersion(value,'0.2.9'));
});
test('in-app download follows GitHub assets, verifies bytes and rechecks them before constructing the install command',async t=>{
 let downloads=0;const fetchRequest=async(url)=>{
  if(url.includes('api.github.com'))return Response.json(release());
  if(url.includes('github.com/'))return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/test/installer'}});
  downloads++;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 };
 const updater=await fixture(t,fetchRequest),states=[];updater.on('state',s=>states.push(s.phase));assert.equal((await updater.check()).phase,'available');
 await Promise.all([updater.download(),updater.download()]);assert.equal(downloads,1);assert.equal(updater.status().phase,'ready');assert.equal(updater.status().progress,1);
 const plan=await updater.installPlan('C:\\Apps with spaces\\REWIND','en');assert.equal(plan.exe,path.join(updater.cacheDir,'REWIND-0.2.10-Setup.exe'));assert.ok(plan.args.includes('/DIR=C:\\Apps with spaces\\REWIND'));assert.ok(plan.args.includes('/SILENT'));assert.ok(plan.args.includes('/REWINDUPDATE=1'));assert.ok(plan.args.includes('/LANG=english'));assert.ok(states.includes('downloading'));
 await fs.writeFile(plan.exe,Buffer.concat([Buffer.from('MZ'),Buffer.alloc(600,0)]));await assert.rejects(updater.installPlan('C:\\Apps','ru'),/checksum/);assert.equal(updater.status().phase,'available');
});
test('bad, truncated or redirected downloads never become executable update candidates and partial files are removed',async t=>{
 for(const mode of ['hash','truncated','oversized','redirect']){
  const updater=await fixture(t,async(url)=>url.includes('api.github.com')?Response.json(release()):mode==='redirect'?new Response(null,{status:302,headers:{location:'https://evil.example/payload'}}):new Response(mode==='truncated'?bytes.subarray(0,10):mode==='oversized'?Buffer.concat([bytes,bytes]):Buffer.alloc(bytes.length)));
  await updater.check();await updater.download();assert.equal(updater.status().phase,'available');assert.ok(updater.status().error);assert.equal(updater.file,null);assert.deepEqual(await fs.readdir(updater.cacheDir),[]);await assert.rejects(updater.installPlan('C:\\Apps','ru'));
 }
});
test('download cancellation leaves replay-independent update state reusable; API rate limits have a recoverable state',async t=>{
 let downloading;const updater=await fixture(t,async(url,options)=>{if(url.includes('api.github.com'))return Response.json(release());downloading=true;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));});
 await updater.check();const pending=updater.download();while(!downloading)await new Promise(r=>setTimeout(r,5));updater.cancel();await pending;assert.equal(updater.status().phase,'available');assert.equal(updater.status().error,null);assert.deepEqual(await fs.readdir(updater.cacheDir),[]);
 updater.fetchRequest=async()=>new Response(null,{status:403});assert.equal((await updater.check()).error,'rate-limit');updater.fetchRequest=async()=>Response.json(release('0.2.9'));assert.equal((await updater.check()).phase,'current');
});
test('uninstall uses only the installed application uninstaller; developer and portable builds cannot remove anything',async t=>{
 const updater=await fixture(t,async()=>Response.json(release()));const directory=updater.cacheDir;
 assert.throws(()=>uninstallPlan({installed:false,platform:'win32',directory}),/not-installed/);assert.throws(()=>uninstallPlan({installed:true,platform:'win32',directory}),/no-uninstaller/);
 await fs.writeFile(path.join(directory,'unins000.exe'),'test-only');await fs.writeFile(path.join(directory,'unins000.dat'),'test-only');
 const plan=uninstallPlan({installed:true,platform:'win32',directory});assert.equal(plan.exe,path.join(directory,'unins000.exe'));assert.deepEqual(plan.args,['/NORESTART','/REWINDREMOVE=1']);
 const portable=new AppUpdater({version:'0.2.9',cacheDir:directory,installed:false,fetchRequest:async()=>Response.json(release())});await portable.check();await assert.rejects(portable.download(),/not-installed/);
});
test('maintenance waits for saved clips and stopped capture before handing off; saving errors prevent exit, launch errors roll back',async()=>{
 const order=[];let release;const wait=new Promise(r=>release=r);
 const handoff=new MaintenanceHandoff({prepare:async()=>{order.push('save');await wait;order.push('stop');},launch:async()=>order.push('launch'),finish:async()=>order.push('exit'),onBusy:b=>order.push(b?'locked':'unlocked')});
 const pending=handoff.run({});await assert.rejects(handoff.run({}),/busy/);assert.deepEqual(order,['locked','save']);release();await pending;assert.deepEqual(order,['locked','save','stop','launch','exit','unlocked']);
 const failed=new MaintenanceHandoff({prepare:async()=>{throw Error('save failed');},launch:async()=>assert.fail('must not launch'),finish:async()=>assert.fail('must not exit')});await assert.rejects(failed.run({}),/save failed/);assert.equal(failed.busy,false);
 let resumed=false;const launchError=new MaintenanceHandoff({prepare:async()=>{},launch:async()=>{throw Error('launch failed');},rollback:async()=>{resumed=true;},finish:async()=>assert.fail('must not exit')});await assert.rejects(launchError.run({}),/launch failed/);assert.equal(resumed,true);
});
test('actual maintenance preparation saves continuous recording before stopping capture; a save failure leaves capture running',async()=>{
 const calls=[],engine={session:{recordStart:0},stop:async()=>calls.push('segments')},saver={waitForIdle:async()=>calls.push('wait'),save:async(kind,at,trigger)=>{assert.equal(kind,'record');assert.equal(trigger,'maintenance');calls.push('saved');}},nativeScreen={stop:async()=>calls.push('video')},captureWorker={stop:async()=>calls.push('worker')},audio={stop:()=>calls.push('audio')};
 await prepareCaptureShutdown({engine,saver,nativeScreen,captureWorker,audio});assert.deepEqual(calls,['wait','saved','wait','video','worker','audio','segments']);
 calls.length=0;saver.save=async()=>{throw Error('disk full');};await assert.rejects(prepareCaptureShutdown({engine,saver,nativeScreen,captureWorker,audio}),/save-failed/);assert.deepEqual(calls,['wait']);
});
test('failure of a save already pending when maintenance starts aborts maintenance and keeps its retryable buffer',async()=>{
 const {SaveController}=require('../electron/save-controller.cjs');let rejectSave,stopped=false;
 const engine={session:{recordStart:null},save:()=>new Promise((resolve,reject)=>rejectSave=reject),stop:async()=>{stopped=true;}},saver=new SaveController({engine,outputDir:()=>'',onSaved:async()=>{}});
 const saving=saver.save('replay').catch(error=>error);const preparing=prepareCaptureShutdown({engine,saver,nativeScreen:{stop:async()=>{stopped=true;}},captureWorker:{stop:async()=>{}},audio:{stop:()=>{}}});rejectSave(Error('disk full'));
 await assert.rejects(preparing,/save-failed/);await saving;assert.equal(stopped,false);assert.ok(engine.session);assert.equal(saver.pending,0);
});
test('a ready installer remains actionable when a voluntary re-check loses the network',async t=>{
 const updater=await fixture(t,async(url)=>url.includes('api.github.com')?Response.json(release()):new Response(bytes));await updater.check();await updater.download();const file=updater.file;
 for(const failure of [async()=>{throw Error('offline');},async()=>new Response(null,{status:403})]){updater.fetchRequest=failure;await updater.check();assert.equal(updater.status().phase,'ready');assert.ok(updater.status().error);assert.equal((await updater.installPlan('C:\\Apps','ru')).exe,file);}
});
test('verified downloads survive restart; startup cleanup removes old update files and leaves other files alone',async t=>{
 const updater=await fixture(t,async(url)=>url.includes('api.github.com')?Response.json(release()):new Response(bytes));await updater.check();await updater.download();
 await fs.writeFile(path.join(updater.cacheDir,'REWIND-0.2.8-Setup.exe'),'old');await fs.writeFile(path.join(updater.cacheDir,'00000000-0000-0000-0000-000000000000.partial'),'partial');await fs.writeFile(path.join(updater.cacheDir,'keep.txt'),'keep');
 const restarted=new AppUpdater({version:'0.2.9',cacheDir:updater.cacheDir,installed:true,platform:'win32',fetchRequest:async()=>Response.json(release())});await restarted.cleanup();assert.deepEqual((await fs.readdir(updater.cacheDir)).sort(),['REWIND-0.2.10-Setup.exe','keep.txt']);assert.equal((await restarted.check()).phase,'ready');
});
test('the update installer resumes the app only on an app-requested update and uninstall preserves user data',async()=>{
 const script=await fs.readFile(path.resolve('installer/rewind.iss'),'utf8');assert.match(script,/Filename: "\{app\}\\REWIND.exe"; Flags: nowait; Check: IsAppUpdate/);assert.match(script,/REWINDREMOVE\|0/);assert.match(script,/WaitForAppHandoff\(\);\s+Result := not IsRewindRunning/);assert.doesNotMatch(script,/\[UninstallDelete\]/);assert.match(script,/PrivilegesRequired=lowest/);
 const translations=JSON.parse(await fs.readFile('src/translations.json','utf8')),component=await fs.readFile('src/AppMaintenance.jsx','utf8');for(const [,key]of component.matchAll(/\bt\('([^']+)'\)/g))assert.ok(translations[key],`Missing English: ${key}`);
});

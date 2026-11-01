// Runs the production renderer with an isolated, deterministic desktop bridge.
const {app,BrowserWindow,session,protocol,ipcMain}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {installWindowPermissions}=require('../electron/window-permissions.cjs'),{defaults}=require('../electron/config.cjs');
const {CaptureEngine}=require('../electron/engine.cjs'),{MediaService}=require('../electron/media.cjs');
const {SoundPlayer}=require('../electron/sounds.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/ui-regression');fs.mkdirSync(work,{recursive:true});app.setPath('userData',path.join(work,'profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');protocol.registerSchemesAsPrivileged([{scheme:'rewind-media',privileges:{standard:true,secure:true,stream:true,corsEnabled:true}}]);
let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function evaluate(code){try{return await win.webContents.executeJavaScript(code,true);}catch(error){throw new Error(code+'\n'+error.message);}}
async function until(code){const start=Date.now();while(!await evaluate(code)){if(Date.now()-start>6000)throw new Error('Timed out: '+code);await pause(25);}}
async function click(selector){await until(`!!document.querySelector(${JSON.stringify(selector)})`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function reload(){console.log('UI_STEP reload');const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await loaded;}
async function openClip(){await click('.clip-play');await until(`!!document.querySelector('.editor-view')`);}
async function select(label,value){await evaluate(`(()=>{const el=document.querySelector('select[aria-label="'+${JSON.stringify(label)}+'"]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.querySelector('select[aria-label="'+${JSON.stringify(label)}+'"]').value===${JSON.stringify(value)}`);}
async function capture(name){console.log('UI_STEP capture '+name);win.show();await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await pause(600);await fs.promises.writeFile(path.join(work,name),(await win.webContents.capturePage()).toPNG());if(name==='fullscreen.png')fs.writeFileSync(path.join(work,'fullscreen-state.json'),await evaluate(`JSON.stringify({element:document.fullscreenElement?.className,stage:document.querySelector('.video-stage').getBoundingClientRect().height,player:document.querySelector('.editor-view').getBoundingClientRect().height,display:getComputedStyle(document.querySelector('.editor-view')).display})`));}
async function run(){
 const busSource=fs.readFileSync(path.join(root,'src/preview-audio.js'),'utf8').split('export class')[0].replace('export function','function');
 let uiConfig={...defaults,outputDir:work};const openedLinks=[];
 ipcMain.handle('test-get-config',()=>uiConfig);ipcMain.handle('test-set-config',(_event,value)=>{uiConfig=value;});ipcMain.handle('test-open-link',(_event,id)=>{openedLinks.push(id);});
 let soundConfig={soundEnabled:true,soundVolume:35};const soundPlayer=new SoundPlayer(()=>soundConfig);
 ipcMain.handle('test-sound',async(_event,name,preview,volume,enabled)=>{soundConfig={soundEnabled:enabled,soundVolume:volume};await soundPlayer.play(name,{preview});});
 ipcMain.handle('test-sound-config',async(_event,volume,enabled)=>{soundConfig={soundEnabled:enabled,soundVolume:volume};await soundPlayer.configure();});
 const fixture=path.join(work,'fixture.mp4'),made=spawnSync(require('ffmpeg-static'),['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',fixture],{encoding:'utf8',windowsHide:true});assert.equal(made.status,0,made.stderr);
 const silent=path.join(work,'silent.mkv'),audio=spawnSync(require('ffmpeg-static'),['-v','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','10','-c:a','libopus',silent],{encoding:'utf8',windowsHide:true});assert.equal(audio.status,0,audio.stderr);
 const epoch=Date.now()-11000,engine=new CaptureEngine(require('ffmpeg-static'),path.join(work,'cache'),()=>{});
 engine.session={started:epoch,dir:work,config:{...defaults,resolution:180,fps:30},lastReplayAt:1.25,recordStart:null,pins:0,inputs:[{id:'video',label:'Video'},{id:'audio1',label:'System'},{id:'audio2',label:'Mic'}]};engine.segments=async track=>[{file:track.id==='video'?fixture:silent,start:0,end:10}];
 const clip=await engine.save(path.join(work,'clips'),'replay',{requestedAt:epoch+9250}),media=new MediaService(require('ffmpeg-static'),path.join(work,'media'),()=>{});
 ipcMain.handle('test-preview',()=>media.preview(clip));ipcMain.handle('test-thumbnail',()=>media.thumbnail(clip));
 const bridge=path.join(work,'preload.cjs');
 fs.writeFileSync(bridge,`const {contextBridge,ipcRenderer}=require('electron');let config=${JSON.stringify({...defaults,outputDir:work})},busy=false,resolveExport;const events={};ipcRenderer.on('test-pause',()=>events.pause?.());const listen=name=>fn=>{events[name]=fn;return()=>delete events[name];};contextBridge.exposeInMainWorld('rewind',{
 init:async()=>{config=await ipcRenderer.invoke('test-get-config');return {config,showSupport:!config.supportPromptDismissed,library:[{id:'fixture',name:'fixture.mp4',title:'Тестовый клип',resolution:1080,fps:60,size:1024,createdAt:Date.now(),duration:10,kind:'replay'},{id:'fixture2',name:'second.mp4',title:'Другой момент',duration:8,resolution:1080,fps:60,size:1024,createdAt:Date.now(),kind:'replay'}],shortcutStatus:[],windowState:{maximized:false}};},
 thumbnail:()=>ipcRenderer.invoke('test-thumbnail'),onPausePlayback:listen('pause'),onNotice:listen('notice'),onCommand:listen('command'),onError:listen('error'),onFlush:listen('flush'),onClipSaved:listen('clip'),onSaveStatus:listen('save'),onShortcuts:listen('keys'),onWindowState:listen('window'),onExportProgress:listen('progress'),stats:async()=>({}),
 openLink:id=>ipcRenderer.invoke('test-open-link',id),configure:async patch=>{config={...config,...patch};await ipcRenderer.invoke('test-set-config',config);await ipcRenderer.invoke('test-sound-config',config.soundVolume,config.soundEnabled);return config;},sound:(name,preview=false)=>ipcRenderer.invoke('test-sound',name,preview,config.soundVolume,config.soundEnabled),audioDevices:async()=>[],preview:()=>ipcRenderer.invoke('test-preview'),
 exportClip:()=>new Promise(resolve=>{resolveExport=resolve;}),cancelExport:async()=>resolveExport(null)
 });`);
 installWindowPermissions(session.defaultSession,()=>win);
 protocol.handle('rewind-media',request=>{const file=media.assets.get(new URL(request.url).pathname.slice(1));if(!file)return new Response('',{status:404});const all=fs.readFileSync(file),range=request.headers.get('range');let start=0,end=all.length-1,status=200;const headers={'Access-Control-Allow-Origin':'*','Content-Type':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.m4a')?'audio/mp4':'video/mp4','Accept-Ranges':'bytes'};if(range){const m=range.match(/bytes=(\d+)-(\d*)/);if(m){start=+m[1];if(m[2])end=Math.min(end,+m[2]);status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+all.length;}}headers['Content-Length']=String(end-start+1);return new Response(all.subarray(start,end+1),{status,headers});});
 win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:720,show:true,frame:false,resizable:true,maximizable:true,fullscreenable:true,backgroundColor:'#111111',webPreferences:{preload:bridge,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.on('minimize',()=>{win.webContents.setAudioMuted(true);win.webContents.send('test-pause');});win.on('restore',()=>win.webContents.setAudioMuted(false));
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)console.error('Renderer:',event.message.slice(0,400));});
 await win.loadFile(path.join(root,'dist/index.html'));await until(`!!document.querySelector('.sidebar')`);
 const protectedPreview=await evaluate(busSource+`; (async()=>{const ctx=new OfflineAudioContext(1,48000,48000),bus=createPreviewBus(ctx);for(let n=0;n<2;n++){const buffer=ctx.createBuffer(1,48000,48000),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=.95*Math.sin(2*Math.PI*440*i/48000);const source=ctx.createBufferSource();source.buffer=buffer;source.connect(bus.input);source.start();}const result=(await ctx.startRendering()).getChannelData(0);return {peak:Math.max(...result.map(Math.abs)),rms:Math.sqrt(result.reduce((sum,x)=>sum+x*x,0)/result.length)};})()`);assert.ok(protectedPreview.peak<.96,JSON.stringify(protectedPreview));assert.ok(protectedPreview.rms>.3);
 await until(`!!document.querySelector('.support-dialog[open]')`);
 assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Закрыть');
 assert.equal(await evaluate(`document.querySelector('.support-dialog a').href`),'https://t.me/axolotllnd');
 await click('.support-dialog a[href="https://t.me/axolotllnd"]');await click('.support-dialog a[href="https://github.com/axolotllnd"]');assert.deepEqual(openedLinks,['telegram','github']);
 await capture('welcome-dark-ru.png');console.log('UI_STEP close');await click('.support-dialog [aria-label="Закрыть"]');await until(`!document.querySelector('.support-dialog')`);await pause(50);assert.equal(uiConfig.supportPromptDismissed,true);
 await reload();await until(`!!document.querySelector('.sidebar')`);assert.equal(await evaluate(`!!document.querySelector('.support-dialog')`),false);
 uiConfig={...uiConfig,language:'en',theme:'light',supportPromptDismissed:false};await reload();await until(`!!document.querySelector('.support-dialog[open]')`);await capture('welcome-light-en.png');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await until(`!document.querySelector('.support-dialog')`);await pause(50);assert.equal(uiConfig.supportPromptDismissed,true);
 uiConfig={...uiConfig,language:'ru',theme:'dark'};await reload();await until(`!!document.querySelector('.sidebar')`);

 assert.equal(await evaluate(`document.querySelector('select[aria-label="Формат файла"]').value`),'mp4');
 await click('details.advanced-quality summary');await select('Кодек','h264');await select('Формат файла','webm');await until(`document.querySelector('select[aria-label="Кодек"]').value==='auto'`);
 assert.equal(await evaluate(`document.querySelector('select[aria-label="Кодек"] option[value="h264"]').disabled`),true);
 await select('Формат файла','mkv');await select('Кодек','vp8');await select('Формат файла','mp4');await until(`document.querySelector('select[aria-label="Кодек"]').value==='auto'`);
 await click('details.advanced-quality summary');await capture('capture-format.png');
 await click('[aria-label="Библиотека"]');await openClip();
 assert.equal(await evaluate(`document.querySelector('video').muted`),true);assert.equal(await evaluate(`document.querySelectorAll('.editor audio').length`),2);
 await until(`document.querySelector('video').duration>0`);assert.ok(Math.abs(await evaluate(`document.querySelector('video').duration`)-8)<.04);
 await until(`document.querySelector('video').readyState>=2`);
 await evaluate(`[...document.querySelectorAll('.editor-timeline button')].find(b=>b.textContent.includes('Убрать весь звук')).click()`);
 assert.equal(await evaluate(`[...document.querySelectorAll('.editor-timeline button')].some(b=>b.textContent.includes('Включить звук'))`),true);
 await evaluate(`[...document.querySelectorAll('.editor-timeline button')].find(b=>b.textContent.includes('Включить звук')).click()`);
 await evaluate(`(()=>{const el=document.querySelector('.trim-track'),r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width*.5,pointerId:1,buttons:1}));})()`);console.log('SEEK_INFO',await evaluate(`JSON.stringify({time:document.querySelector('video').currentTime,duration:document.querySelector('video').duration,ranges:document.querySelector('video').seekable.length,aria:document.querySelector('.trim-track').getAttribute('aria-valuenow')})`));await until(`document.querySelector('video').currentTime>3`);
 await capture('editor-browser-dark.png');
 await click('.clip-browser-strip>button:nth-child(2)');await until(`!!document.querySelector('dialog')`);await click('dialog .primary-btn');await until(`document.querySelector('.editor-heading h1').textContent==='Другой момент'`);
 await click('.clip-browser-strip>button:nth-child(1)');await until(`document.querySelector('.editor-heading h1').textContent==='Тестовый клип'`);await until(`document.querySelector('video')?.readyState>=2`);
 await click('.transport [aria-label="Воспроизвести"]');await until(`document.querySelector('video').currentTime>0`);win.minimize();await until(`[...document.querySelectorAll('.editor video,.editor audio')].every(v=>v.paused)`);win.restore();win.show();assert.equal(await evaluate(`document.querySelector('.editor video').paused`),true);
 await click('.transport [aria-label="Полный экран"]');await until(`!!document.fullscreenElement`);
 assert.equal(await evaluate(`document.fullscreenElement.className`),'editor-view');assert.equal(win.isFullScreen(),true);
 assert.equal(await evaluate(`!!document.fullscreenElement.querySelector('.transport input')`),true);
 const fsRect=await evaluate(`(()=>{const r=document.fullscreenElement.getBoundingClientRect(),v=document.querySelector('.video-stage').getBoundingClientRect();return {width:r.width,height:r.height,viewport:[innerWidth,innerHeight],stageHeight:v.height};})()`);
 assert.deepEqual([fsRect.width,fsRect.height],fsRect.viewport);assert.ok(fsRect.stageHeight>500);
 await capture('fullscreen.png');
 assert.equal(await evaluate(`document.fullscreenElement?.className`),'editor-view','Fullscreen must remain active after the native transition');
 await click('.transport [aria-label="Выйти из полного экрана"]');await until(`!document.fullscreenElement`);assert.equal(win.isFullScreen(),false);
 // The same restored native window must still maximize and unmaximize normally.
 win.maximize();await pause(150);assert.equal(win.isMaximized(),true);
 await click('.transport [aria-label="Полный экран"]');await until(`!!document.fullscreenElement`);await click('.transport [aria-label="Выйти из полного экрана"]');await until(`!document.fullscreenElement`);assert.equal(win.isMaximized(),true);
 win.unmaximize();await pause(150);assert.equal(win.isMaximized(),false);
 for(const [name,heading] of [['Звук','Звук и дорожки'],['Бинды','Горячие клавиши'],['Настройки','Настройки'],['Запись','Центр записи'],['Библиотека','Твои моменты']]){
  await click('.sidebar [aria-label="'+name+'"]');await until(`document.querySelector('dialog')?.open===true`);
  assert.equal(await evaluate(`document.activeElement.textContent`),'Остаться');
  if(name==='Звук'){
   await capture('dialog-dark.png');
   await click('dialog .secondary-btn');await until(`!document.querySelector('dialog')`);assert.equal(await evaluate(`!!document.querySelector('.editor-view')`),true);
   assert.equal(await evaluate(`document.querySelector('.nav-item.selected').getAttribute('aria-label')`),'Библиотека');
   await click('.sidebar [aria-label="Звук"]');await until(`document.querySelector('dialog')?.open===true`);
  }
  await click('dialog .primary-btn');await until(`!document.querySelector('.editor')`);
  assert.equal(await evaluate(`document.querySelector('main h1').textContent`),heading);
  await click('.sidebar [aria-label="Библиотека"]');await openClip();
 }
 // Back uses the same confirmation; native Escape cancellation preserves the editor.
 await click('.editor-heading .text-btn');await until(`document.querySelector('dialog')?.open===true`);
 await evaluate(`document.querySelector('dialog').dispatchEvent(new Event('cancel',{cancelable:true}))`);await until(`!document.querySelector('dialog')`);assert.equal(await evaluate(`!!document.querySelector('.editor')`),true);
 await click('.export-action');await until(`document.querySelector('.export-action').disabled`);
 await click('.sidebar [aria-label="Звук"]');assert.equal(await evaluate(`!!document.querySelector('dialog')`),false);assert.equal(await evaluate(`!!document.querySelector('.editor')`),true);
 await evaluate(`window.rewind.cancelExport()`);await until(`!document.querySelector('.export-action').disabled`);
 await click('.sidebar [aria-label="Настройки"]');await until(`document.querySelector('dialog')?.open===true`);await click('dialog .primary-btn');await until(`!document.querySelector('.editor')`);
 await click('.theme-card.light');await evaluate(`(()=>{const el=document.querySelector('select[aria-label="Язык приложения"]');el.value='en';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await until(`document.documentElement.lang==='en'`);
 assert.equal(await evaluate(`!!document.querySelector('.language-button,.theme-switch')`),false);
 await evaluate(`document.querySelector('main').scrollTop=99999`);assert.equal(await evaluate(`document.querySelector('.titlebar').getBoundingClientRect().top`),0);
 await capture('settings-light-en.png');
 await click('.sidebar [aria-label="Settings"]');await until(`!!document.querySelector('.sound-preview')`);assert.equal(await evaluate(`document.querySelector('.sound-volume span').textContent`),'35%');
 await click('.sound-preview button:nth-child(2)');assert.ok(soundPlayer.window);assert.equal(await soundPlayer.window.webContents.executeJavaScript('players.saved.volume'),.35);
 await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Sound volume"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'20');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await until(`document.querySelector('.sound-volume span').textContent==='20%'`);
 await click('.sound-preview button:nth-child(3)');assert.equal(await soundPlayer.window.webContents.executeJavaScript('players.start.volume'),.2);
 await evaluate(`document.querySelector('.sound-preview').closest('.settings-section').scrollIntoView({block:'center'})`);await capture('sound-settings-light-en.png');await click('[role="switch"][aria-label="App sounds"]');await until(`document.querySelector('[role="switch"][aria-label="App sounds"]').getAttribute('aria-checked')==='false'`);await pause(80);assert.equal(await soundPlayer.window.webContents.executeJavaScript('Object.values(players).every(audio=>audio.paused)'),true);
 await evaluate(`window.rewind.sound('error')`);assert.equal(await soundPlayer.window.webContents.executeJavaScript('players.error.paused'),true);
 console.log('UI_REGRESSION_OK: fullscreen enter/exit, native maximize/restore, 5 guarded routes, cancel, export guard, light EN');
}
app.whenReady().then(run).then(()=>app.exit(0)).catch(error=>{console.error(error.stack);app.exit(1);});

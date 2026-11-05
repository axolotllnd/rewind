const {BrowserWindow,screen}=require('electron');const path=require('node:path');
function bounded(promise,ms=4000){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Overlay renderer timeout')),ms))]).finally(()=>clearTimeout(timer));}
class Overlay{
 constructor(getConfig){this.getConfig=getConfig;this.window=null;this.timer=null;this.sequence=0;this.queue=Promise.resolve();this.holdUntil=0;}
 show(title,detail,{minimumVisibleMs=1200}={}){const task=this.queue.catch(()=>{}).then(async()=>{const wait=this.holdUntil-Date.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));try{await bounded(this.display(title,detail));}catch(error){if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;await bounded(this.display(title,detail));}this.holdUntil=Date.now()+minimumVisibleMs;});this.queue=task;return task;}
 async ensureWindow(){
  if(this.window&&!this.window.isDestroyed()&&!this.window.webContents.isDestroyed()&&!this.window.webContents.isCrashed())return this.ready;
  if(this.window&&!this.window.isDestroyed())this.window.destroy();
  const win=this.window=new BrowserWindow({title:'REWIND Overlay',width:472,height:136,frame:false,resizable:false,show:false,transparent:true,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.setIgnoreMouseEvents(true);win.setContentProtection(false);win.setAlwaysOnTop(true,'screen-saver');win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  this.ready=win.loadFile(path.join(__dirname,'../assets/overlay.html')).then(()=>win).catch(error=>{
   if(this.window===win)this.window=null;
   if(!win.isDestroyed())win.destroy();
   throw error;
  });
  return this.ready;
 }
 async display(title,detail){
  const cfg=this.getConfig();if(!cfg.notifications)return;const token=++this.sequence;clearTimeout(this.timer);clearInterval(this.raiseTimer);await this.ensureWindow();
  const display=screen.getAllDisplays().find(d=>String(d.id)===String(cfg.sourceDisplayId))||screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),area=display.workArea,win=this.window;
  win.setPosition(area.x+area.width-480,cfg.notificationPosition==='bottom-right'?area.y+area.height-148:area.y+12);
  await win.webContents.executeJavaScript('window.updateNotice('+JSON.stringify({title:String(title),detail:String(detail||''),dark:cfg.theme==='dark',glow:cfg.overlayGlow!==false})+')');
  if(token!==this.sequence||win.isDestroyed())return;win.setContentProtection(false);win.setAlwaysOnTop(true,'screen-saver');win.showInactive();win.moveTop();await win.webContents.executeJavaScript('window.enterNotice()');
  this.raiseTimer=setInterval(()=>{if(!win.isDestroyed()&&win.isVisible()){win.setAlwaysOnTop(true,'screen-saver');win.moveTop();}},750);this.raiseTimer.unref();
  this.timer=setTimeout(()=>{if(token!==this.sequence||win.isDestroyed())return;win.webContents.executeJavaScript("document.querySelector('.notice').classList.remove('visible')").catch(()=>{});this.timer=setTimeout(()=>{if(token===this.sequence){clearInterval(this.raiseTimer);if(!win.isDestroyed())win.hide();}},450);},3500);
 }
}
module.exports={Overlay};

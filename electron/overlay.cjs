const {BrowserWindow,screen}=require('electron');const fs=require('node:fs'),path=require('node:path');
function bounded(promise,ms=4000){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Overlay renderer timeout')),ms))]).finally(()=>clearTimeout(timer));}
class Overlay{
 constructor(getConfig){this.getConfig=getConfig;this.window=null;this.timer=null;this.sequence=0;this.queue=Promise.resolve();this.holdUntil=0;}
 show(title,detail,{minimumVisibleMs=1200}={}){const task=this.queue.catch(()=>{}).then(async()=>{const wait=this.holdUntil-Date.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));try{await bounded(this.display(title,detail));}catch(error){if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;await bounded(this.display(title,detail));}this.holdUntil=Date.now()+minimumVisibleMs;});this.queue=task;return task;}
 async ensureWindow(){
  if(this.window&&!this.window.isDestroyed()&&!this.window.webContents.isDestroyed()&&!this.window.webContents.isCrashed())return;
  if(this.window&&!this.window.isDestroyed())this.window.destroy();
  const win=this.window=new BrowserWindow({title:'REWIND Overlay',width:472,height:136,frame:false,resizable:false,show:false,transparent:true,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.setIgnoreMouseEvents(true);win.setContentProtection(false);win.setAlwaysOnTop(true,'screen-saver');win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  let mark='';try{mark=fs.readFileSync(path.join(__dirname,'../assets/mark.svg'),'utf8');}catch{}
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>REWIND Overlay</title><style>
   :root{--bg:#111111f5;--text:#f6f4ee;--accent:#e6d7bd}body{margin:0;overflow:hidden;font:16px 'Segoe UI',sans-serif;color:var(--text)}body.light{--bg:#f6f4eef8;--text:#242420;--accent:#aa9168}.notice{margin:16px;display:flex;align-items:center;height:100px;background:var(--bg);border:1px solid #8883;border-radius:8px;transform:translateX(115%);opacity:0;transition:transform 420ms cubic-bezier(.22,1,.36,1),opacity 240ms ease-out}.notice.visible{transform:translateX(0);opacity:1}.glow .notice{box-shadow:0 0 14px #e6d7bd36,0 6px 16px #0004}.rail{width:4px;height:56px;background:var(--accent);border-radius:0 3px 3px 0;flex-shrink:0}.mark{margin:0 22px;width:43px;height:43px}.mark svg{width:43px;height:43px;fill:var(--accent)}strong{font-weight:500;font-size:17px}.detail{font-size:11px;opacity:.72;margin-top:7px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(prefers-reduced-motion:reduce){.notice{transform:none;transition:opacity 120ms}}
   </style><div class="notice"><span class="rail"></span><span class="mark">${mark}</span><div><strong></strong><div class="detail"></div></div></div><script>window.updateNotice=(value)=>{document.body.className=(value.dark?'':'light ')+(value.glow?'glow':'');document.querySelector('strong').textContent=value.title;document.querySelector('.detail').textContent=value.detail;document.querySelector('.notice').classList.remove('visible');};window.enterNotice=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelector('.notice').classList.add('visible')));</script>`));
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

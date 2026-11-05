const soundNames=new Set(['startup','saving','saved','start','stop','enabled','disabled','error','tap']);

class SoundPlayer{
 constructor(config,surface){
  this.config=config;
  this.surface=surface;
  this.last=new Map();
 }
 volume(){
  return Math.max(0,Math.min(100,this.config().soundVolume??35))/100;
 }
 async configure(){
  if(!this.surface.window||this.surface.window.isDestroyed())return;
  const window=await this.surface.ensureWindow();
  const enabled=!!this.config().soundEnabled;
  await window.webContents.executeJavaScript(`window.soundSettings(${this.volume()},${enabled})`);
 }
 async play(name,{preview=false}={}){
  if(!soundNames.has(name)||!this.config().soundEnabled&&!preview)return;
  const now=Date.now();
  if(now-(this.last.get(name)||0)<200)return;
  this.last.set(name,now);
  const window=await this.surface.ensureWindow();
  if(!this.config().soundEnabled&&!preview)return;
  await window.webContents.executeJavaScript(`window.playSound(${JSON.stringify(name)},${this.volume()})`);
 }
}
module.exports={SoundPlayer};

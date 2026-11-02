const {spawn}=require('node:child_process');const {EventEmitter}=require('node:events');
function parseAccelerator(value){
 const modifierKeys={ctrl:1,control:1,commandorcontrol:1,alt:2,shift:4,super:8,meta:8,win:8};
 const keys={space:32,tab:9,enter:13,return:13,escape:27,esc:27,backspace:8,delete:46,insert:45,home:36,end:35,pageup:33,pagedown:34,left:37,arrowleft:37,up:38,arrowup:38,right:39,arrowright:39,down:40,arrowdown:40,capslock:20,numlock:144,scrolllock:145,printscreen:44,pause:19,plus:187,minus:189,';':186,':':186,'=':187,',':188,'<':188,'-':189,'_':189,'.':190,'>':190,'/':191,'?':191,'`':192,'~':192,'[':219,'{':219,'\\':220,'|':220,']':221,'}':221,"'":222,'"':222,numadd:107,numsub:109,nummult:106,numdiv:111,numdec:110,numenter:13};
 if(typeof value!=='string')return null;let modifiers=0,key=null;
 for(const part of value.split('+')){const p=part.toLowerCase();if(Object.hasOwn(modifierKeys,p)){modifiers|=modifierKeys[p];continue;}if(key!==null)return null;
  if(/^[a-z0-9]$/i.test(part))key=part.toUpperCase().charCodeAt(0);
  else if(/^f([1-9]|1\d|2[0-4])$/i.test(part))key=111+Number(part.slice(1));
  else if(/^num\d$/.test(p))key=96+Number(p.slice(3));
  else if(Object.hasOwn(keys,p))key=keys[p];else return null;
 }
 return key!==null&&modifiers?{key,modifiers}:null;
}
class SharedShortcuts extends EventEmitter{
 constructor(executable,dispatch,{spawnProcess=spawn}={}){super();this.executable=executable;this.dispatch=dispatch;this.spawnProcess=spawnProcess;this.bindings=new Map();this.ready=false;this.stopped=false;}
 async start(){if(this.starting)return this.starting;this.stopped=false;this.starting=new Promise((resolve,reject)=>{let buffer='',errors='',settled=false;const child=this.child=this.spawnProcess(this.executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>finish(Error('Hotkey bridge startup timed out')),4000);const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve();};child.stdin.on('error',()=>{});child.stderr.on('data',d=>errors=(errors+d).slice(-2000));child.stdout.on('data',data=>{if(this.child!==child)return;buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);if(event.type==='ready'){if(event.backend!=='raw-input'){finish(Error('Hotkey bridge does not support Raw Input'));continue;}this.backend=event.backend;this.ready=true;this.update();finish();}else if(event.type==='press'&&[...this.bindings.values()].some(b=>b.action===event.action&&b.key===event.key&&b.modifiers===event.modifiers)&&Number.isFinite(event.at))this.dispatch(event.action,event.at);}catch{}}if(buffer.length>8192)buffer='';});child.on('error',finish);child.on('close',()=>{if(this.child!==child)return;this.ready=false;if(!settled)finish(Error(errors||'Hotkey bridge closed'));else if(!this.stopped)this.emit('failure',Error(errors||'Hotkey bridge closed'));});});try{await this.starting;}finally{this.starting=null;}}
 register(accelerator,action){const parsed=parseAccelerator(accelerator);if(!this.ready||!parsed)return false;this.bindings.set(accelerator,{...parsed,action});this.update();return true;}
 clear(){this.bindings.clear();this.update();}
 update(){if(this.ready&&!this.child?.stdin.destroyed)this.child.stdin.write(JSON.stringify([...this.bindings.values()])+'\n');}
 stop(){this.stopped=true;this.ready=false;this.child?.stdin.end();this.child?.kill();this.bindings.clear();}
}
module.exports={SharedShortcuts,parseAccelerator};

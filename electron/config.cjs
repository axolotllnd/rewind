const {shortcutSignature}=require('./shortcuts.cjs');
const defaults = {theme:'dark',language:'ru',width:1920,resolution:1080,fps:60,bitrate:20,supportPromptDismissed:false,resumeReplay:true,replayAutostartConfigured:false,replayEnabled:false,revealAfterExport:true,overlayGlow:true,soundEnabled:true,soundVolume:35,codec:'auto',outputFormat:'mp4',replaySeconds:30,outputDir:'',launchAtLogin:true,minimizeToTray:true,notifications:true,notificationPosition:'top-right',sourceType:'screen',sourceId:'',sourceName:'',shortcuts:{replay:'Alt+F10',record:'Alt+F9',toggle:'Alt+Shift+F10'},audio:[{id:'system',label:'Звук компьютера',deviceId:'default',flow:'output',enabled:true,track:1,gain:100},{id:'mic',label:'Микрофон',deviceId:'default',flow:'input',enabled:false,track:2,gain:100}]};
function validateConfig(input, previous=defaults){
 const s={...previous,...input,shortcuts:{...previous.shortcuts,...input.shortcuts}};
 if(!Number.isFinite(s.soundVolume)||s.soundVolume<0||s.soundVolume>100)throw Error('Недопустимая громкость сигналов');s.soundEnabled=!!s.soundEnabled;s.supportPromptDismissed=!!s.supportPromptDismissed;for(const key of ['resumeReplay','replayEnabled','revealAfterExport','overlayGlow'])s[key]=!!s[key];
 for(const [key,values] of Object.entries({theme:['dark','light'],language:['ru','en'],codec:['auto','h264','vp9','vp8'],outputFormat:['mp4','mkv','webm'],sourceType:['screen','window'],notificationPosition:['top-right','bottom-right']})) if(!values.includes(s[key])) throw new Error(`Недопустимое значение: ${key}`);
 if(s.outputFormat==='mp4'&&s.codec==='vp8')throw new Error('MP4 поддерживает H.264 и VP9. Для VP8 выберите MKV или WebM.');
 if(s.outputFormat==='webm'&&s.codec==='h264')throw new Error('WebM поддерживает VP8 и VP9. Для H.264 выберите MP4 или MKV.');
 if(input.resolution!==undefined&&input.width===undefined)s.width=Math.round(s.resolution*16/9/2)*2;
 for(const [k,min,max] of [['width',64,7680],['resolution',64,4320],['fps',1,240],['replaySeconds',1,1800]])if(!Number.isInteger(s[k])||s[k]<min||s[k]>max)throw new Error(`Invalid ${k}: ${min}–${max}`);
 if(s.width%2||s.resolution%2)throw new Error('Width and height must be even');
 if(!Number.isFinite(s.bitrate)||s.bitrate<5||s.bitrate>150) throw new Error('Битрейт должен быть от 5 до 150 Мбит/с');
 if(!Array.isArray(s.audio)||s.audio.length>8) throw new Error('Допускается до 8 источников звука');
 const ids=new Set();
 s.audio=s.audio.map(a=>{if(!a.id||ids.has(a.id)||!Number.isInteger(a.track)||a.track<1||a.track>6||!Number.isFinite(a.gain)||a.gain<0||a.gain>200) throw new Error('Неверная маршрутизация звука');ids.add(a.id);const flow=a.flow||(a.id==='system'?'output':'input');if(!['output','input'].includes(flow))throw new Error('Invalid audio flow');return {id:String(a.id),label:String(a.label).slice(0,100),deviceId:a.deviceId==='system'?'default':String(a.deviceId),flow,enabled:!!a.enabled,track:a.track,gain:a.gain};});
 if(Object.values(s.shortcuts).some(k=>typeof k!=='string'||k.length>80)||new Set(Object.values(s.shortcuts).filter(Boolean).map(shortcutSignature)).size!==Object.values(s.shortcuts).filter(Boolean).length) throw new Error('Задайте три разные комбинации клавиш');
 return s;
}
function selectSegments(segments,start,end){return segments.filter(s=>s.end>start&&s.start<end).sort((a,b)=>a.start-b.start);}
module.exports={defaults,validateConfig,selectSegments};

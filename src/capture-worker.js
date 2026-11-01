import {BrowserRecorder} from './capture';
const api=window.captureWorker;let recorder;
async function run(request){try{let value;if(request.action==='start'){recorder=new BrowserRecorder({start:async()=>{},videoStarted:api.videoStarted,append:api.append,stop:async()=>{}},state=>{if(state.error)api.failure(state.error);});value=await recorder.start(request.config);}else if(request.action==='flush')await recorder?.flush();else if(request.action==='stop'){await recorder?.stop();recorder=null;}await api.reply(request.id,{value});}catch(error){await api.reply(request.id,{error:error.message});}}
window.startCapture=run;api.onCommand(run);

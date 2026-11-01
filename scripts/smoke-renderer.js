(async()=>{try{
 const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});
 const context=new AudioContext({sampleRate:48000});await context.resume();const dest=context.createMediaStreamDestination(),osc=context.createOscillator();osc.frequency.value=440;osc.connect(dest);osc.start();
 const mime=['video/mp4;codecs=avc1.42002a','video/webm;codecs=vp9','video/webm;codecs=vp8'].find(m=>MediaRecorder.isTypeSupported(m));
 await testAPI.start([{id:'video',label:'Native Windows window'},{id:'audio1',label:'Generated tone'}]);
 const specs=[['video',new MediaStream(stream.getVideoTracks()),{mimeType:mime,videoBitsPerSecond:2000000,videoKeyFrameIntervalDuration:2000}],['audio1',dest.stream,{mimeType:'audio/webm;codecs=opus'}]];
 let queues=[];const recorders=specs.map(([id,s,options])=>{const r=new MediaRecorder(s,options),q={p:Promise.resolve()};queues.push(q);r.ondataavailable=e=>{if(e.data.size)q.p=q.p.then(async()=>testAPI.append(id,new Uint8Array(await e.data.arrayBuffer())));};r.start(500);return r;});
 await new Promise(r=>setTimeout(r,8000));for(const r of recorders)r.requestData();await new Promise(r=>setTimeout(r,300));await Promise.all(queues.map(q=>q.p));
 const result={actual:stream.getVideoTracks()[0].getSettings(),mime};
 await testAPI.result(result);for(const r of recorders)r.stop();stream.getTracks().forEach(t=>t.stop());osc.stop();await context.close();
}catch(e){await testAPI.result({error:e.stack||e.message});}})();

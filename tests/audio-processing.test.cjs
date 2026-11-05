const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {mixFilter}=require('../electron/audio-processing.cjs');
test('loud simultaneous sources are limited without clipping, silence, or a shifted timeline',()=>{
 const filter=mixFilter([{gain:200},{gain:200}]);
 const r=spawnSync(require('ffmpeg-static'),['-v','error','-f','lavfi','-i','aevalsrc=0.9*sin(2*PI*440*t):s=48000:d=1','-f','lavfi','-i','aevalsrc=0.9*sin(2*PI*440*t):s=48000:d=1','-filter_complex',filter,'-map','[out]','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:1024*1024});
 assert.equal(r.status,0,r.stderr.toString());let peak=0,power=0;for(let i=0;i<r.stdout.length;i+=4){const n=r.stdout.readFloatLE(i);assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));power+=n*n;}
 assert.ok(peak<.95,`Peak ${peak}`);assert.ok(Math.sqrt(power/(r.stdout.length/4))>.4);assert.equal(r.stdout.length/4,48000);
});

test('rolling audio fragments join into the exact decoded waveform without boundary clicks',{timeout:15000},async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),{CaptureEngine}=require('../electron/engine.cjs');
 const ffmpeg=require('ffmpeg-static'),root=path.resolve('work/audio-fragment-tests');await fs.mkdir(root,{recursive:true});
 function ff(args){const r=spawnSync(ffmpeg,['-v','error','-y',...args],{windowsHide:true,maxBuffer:8e6,timeout:10000});assert.equal(r.status,0,String(r.stderr));return r.stdout;}
 const source=path.join(root,'tone.webm');
 ff(['-f','lavfi','-i','aevalsrc=0.9*sin(2*PI*997*t):s=48000:d=12','-ac','2','-c:a','libopus','-b:a','192k',source]);
 const errors=[],engine=new CaptureEngine(ffmpeg,path.join(root,'cache'),e=>errors.push(e));
 let track;
 try {await engine.start([{id:'audio1',label:'Synthetic tone'}],{replaySeconds:120});track=engine.session.inputs[0];await engine.append('audio1',await fs.readFile(source));}
 finally {await engine.stop({preserve:true});}
 assert.deepEqual(errors,[]);
 const rows=await engine.segments(track,{closedOnly:true});assert.ok(rows.length>=12);
 const list=path.join(root,'concat.txt');await fs.writeFile(list,rows.map((seg,i)=>`file '${seg.file.replaceAll('\\','/').replaceAll("'","'\\''")}'\nduration ${Math.max(.001,(rows[i+1]?.start??seg.end)-seg.start)}`).join('\n'));
 const reference=ff(['-i',source,'-ac','1','-f','f32le','pipe:1']);
 const joined=ff(['-f','concat','-safe','0','-i',list,'-ac','1','-f','f32le','pipe:1']);
 assert.ok(joined.equals(reference),'Segment boundaries changed decoded audio');
 let step=0;for(let i=4;i<joined.length;i+=4)step=Math.max(step,Math.abs(joined.readFloatLE(i)-joined.readFloatLE(i-4)));
 assert.ok(step<.14,`Click in loud 997 Hz tone: ${step}`);
});

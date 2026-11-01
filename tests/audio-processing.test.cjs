const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {mixFilter}=require('../electron/audio-processing.cjs');
test('loud simultaneous sources are limited without clipping, silence, or a shifted timeline',()=>{
 const filter=mixFilter([{gain:200},{gain:200}]);
 const r=spawnSync(require('ffmpeg-static'),['-v','error','-f','lavfi','-i','aevalsrc=0.9*sin(2*PI*440*t):s=48000:d=1','-f','lavfi','-i','aevalsrc=0.9*sin(2*PI*440*t):s=48000:d=1','-filter_complex',filter,'-map','[out]','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:1024*1024});
 assert.equal(r.status,0,r.stderr.toString());let peak=0,power=0;for(let i=0;i<r.stdout.length;i+=4){const n=r.stdout.readFloatLE(i);assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));power+=n*n;}
 assert.ok(peak<.95,`Peak ${peak}`);assert.ok(Math.sqrt(power/(r.stdout.length/4))>.4);assert.equal(r.stdout.length/4,48000);
});

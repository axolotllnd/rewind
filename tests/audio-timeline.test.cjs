const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');

test('native PCM preserves loud audio under timestamp jitter, invalid clocks, delays and pipe backpressure',{skip:process.platform!=='win32',timeout:30000},()=>{
 const folder=path.resolve('work/audio-timeline-tests');fs.mkdirSync(folder,{recursive:true});
 const exe=path.join(folder,'AudioTimelineFixture.exe');
 const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const build=spawnSync(compiler,['/nologo','/optimize+','/platform:x64','/target:exe','/out:'+exe,path.resolve('native/AudioTimeline.cs'),path.resolve('tests/AudioTimelineFixture.cs')],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(exe,[],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(run.status,0,run.stdout+run.stderr);
 for(const marker of ['JITTER_BIT_EXACT_OK','INVALID_TIMESTAMP_OK','CLOCK_DRIFT_OK','DELAY_AND_GAP_OK','BACKPRESSURE_OK'])assert.ok(run.stdout.includes(marker),run.stdout);
});

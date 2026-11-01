const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
test('desktop regression: fullscreen and restore, guarded editor routes, exporting and RU/EN', {timeout:60000},async()=>{
 const result=await new Promise(resolve=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[path.join(__dirname,'ui-runner.cjs')],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out\n'+output});},55000);
  child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message});});
  child.on('exit',code=>{clearTimeout(timer);resolve({code,output});});
 });
 assert.equal(result.code,0,result.output);
 assert.match(result.output,/UI_REGRESSION_OK/);
});

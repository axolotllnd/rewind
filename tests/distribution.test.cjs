const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {storagePaths}=require('../electron/storage-paths.cjs'),{socialUrl}=require('../electron/social-links.cjs'),{defaults,validateConfig}=require('../electron/config.cjs');
test('installed updates use per-user data and Videos, independently of the chosen application folder',()=>{
 const input={packaged:true,installed:true,exeDir:'C:/Apps/REWIND',appData:'C:/Users/Player/AppData/Roaming',videos:'D:/Видео',devProfile:'C:/dev/work/profile'};
 const a=storagePaths(input),b=storagePaths({...input,exeDir:'D:/Другое место/REWIND'});
 assert.deepEqual(a,b);assert.equal(a.data,path.join(input.appData,'REWIND'));assert.equal(a.clips,path.join(input.videos,'REWIND'));
 assert.equal(storagePaths({...input,installed:false}).data,path.join(input.exeDir,'data'));
 assert.equal(storagePaths({...input,packaged:false}).data,input.devProfile);
});
test('community links only open the two author destinations; first-run dismissal survives config changes',()=>{
 assert.equal(socialUrl('github'),'https://github.com/axolotllnd');assert.equal(socialUrl('telegram'),'https://t.me/axolotllnd');
 for(const value of ['https://example.com','file:///C:/test','__proto__','constructor','toString',null])assert.throws(()=>socialUrl(value));
 assert.equal(defaults.supportPromptDismissed,false);const dismissed=validateConfig({supportPromptDismissed:true});assert.equal(validateConfig({theme:'light'},dismissed).supportPromptDismissed,true);
});

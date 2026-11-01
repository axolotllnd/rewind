const path=require('node:path');
function storagePaths({packaged,installed,exeDir,appData,videos,devProfile}){
 const data=packaged?(installed?path.join(appData,'REWIND'):path.join(exeDir,'data')):devProfile;
 return {data,clips:packaged&&installed?path.join(videos,'REWIND'):path.join(data,'Clips')};
}
module.exports={storagePaths};

function installWindowPermissions(browserSession,getWindow){
 browserSession.setPermissionRequestHandler((contents,permission,callback)=>{
  const windows=[getWindow()].flat().filter(Boolean),trusted=windows.find(window=>contents===window.webContents);
  callback(!!trusted&&['media','display-capture','fullscreen'].includes(permission)&&(permission!=='fullscreen'||trusted===windows[0]));
 });
}
module.exports={installWindowPermissions};

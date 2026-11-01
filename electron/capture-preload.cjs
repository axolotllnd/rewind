const {contextBridge,ipcRenderer}=require('electron');const invoke=name=>(...args)=>ipcRenderer.invoke('capture-worker:'+name,...args);
contextBridge.exposeInMainWorld('captureWorker',{append:invoke('append'),videoStarted:invoke('video-start'),reply:invoke('reply'),failure:invoke('failure'),onCommand:fn=>ipcRenderer.on('capture-worker:command',(_event,value)=>fn(value))});

const fs=require('node:fs');

// The packaged FFmpeg uses inherited pipes exclusively. Keep the original
// entry point and imports, and prevent Windows from allocating a console.
function configureBackgroundExecutable(file){
 const image=fs.readFileSync(file);
 if(image.length<64||image.toString('ascii',0,2)!=='MZ')throw Error('Expected a Windows executable');
 const pe=image.readUInt32LE(0x3c);
 const optional=pe+24;
 if(optional+152>image.length||image.readUInt32LE(pe)!==0x4550||
    image.readUInt16LE(pe+20)<152||image.readUInt16LE(optional)!==0x20b){
  throw Error('Expected a PE32+ executable');
 }
 const certificate=optional+112+4*8;
 if(image.readUInt32LE(certificate)||image.readUInt32LE(certificate+4)){
  throw Error('Cannot change the subsystem of a signed executable');
 }
 const subsystem=optional+68;
 if(image.readUInt16LE(subsystem)!==3)throw Error('Expected a console executable');
 image.writeUInt16LE(2,subsystem);
 image.writeUInt32LE(0,optional+64);
 fs.writeFileSync(file,image);
}
module.exports={configureBackgroundExecutable};

const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

function fileHash(file){
 const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
 const handle=fs.openSync(file,'r');
 try{
  let size;
  while((size=fs.readSync(handle,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,size));
 }finally{fs.closeSync(handle);}
 return hash.digest('hex');
}

function packageFiles(root){
 const files=new Map();
 function scan(relative){
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
   if(!relative&&entry.name==='data')continue;
   const name=relative?relative+'\\'+entry.name:entry.name;
   // These names go into quoted Inno Setup and Pascal strings.
   if(!/^[\p{L}\p{N} _.@()+-]+$/u.test(entry.name)||entry.name==='.'||entry.name==='..'){
    throw Error('Unsupported package path: '+name);
   }
   if(entry.isDirectory())scan(name);
   else if(entry.isFile())files.set(name,path.join(root,name));
   else throw Error('Package contains a link or non-regular file: '+name);
  }
 }
 scan('');
 return files;
}

function buildIncludes({target,previous,base,output}){
 const files=packageFiles(target);
 const hashes=new Map([...files].map(([name,file])=>[name,fileHash(file)]));
 const obsolete=new Map();
 for(const folder of previous){
  for(const [name,file] of packageFiles(folder)){
   if(files.has(name))continue;
   const candidates=obsolete.get(name)||new Set();
   candidates.add(fileHash(file));
   obsolete.set(name,candidates);
  }
 }
 fs.mkdirSync(output,{recursive:true});
 const cleanup=path.join(output,'cleanup.iss');
 const remove=[...obsolete].flatMap(([name,hashes])=>[...hashes].map(hash=>`  RemoveObsoleteFile('${name}', '${hash}');`));
 fs.writeFileSync(cleanup,['procedure RemoveObsoleteFiles();','begin',...remove,'end;',''].join('\n'));
 if(!base)return {cleanup};
 const before=packageFiles(base);
 const changed=[],kept=[];
 for(const [name,file] of files){
  const old=before.get(name);
  (old&&fileHash(old)===hashes.get(name)?kept:changed).push([name,file]);
 }
 const packageJson='resources\\app\\package.json';
 const rows=changed.map(([name,file])=>{
  const folder=path.win32.dirname(name);
  return `Source: "${file}"; DestDir: "{app}${folder==='.'?'':'\\'+folder}"; Flags: ignoreversion`;
 });
 const checks=[
  'function VerifyUpdateBase(): Boolean;',
  'begin',
  '  Result := False;',
  `  if not PackageFileMatches('${packageJson}', '${fileHash(before.get(packageJson))}') then Exit;`,
  ...kept.map(([name])=>`  if not PackageFileMatches('${name}', '${hashes.get(name)}') then Exit;`),
  ...changed.map(([name])=>`  if not SafePackagePath('${name}') then Exit;`),
  '  Result := True;',
  'end;',''
 ];
 const updateFiles=path.join(output,'files.iss'),updateChecks=path.join(output,'checks.iss');
 fs.writeFileSync(updateFiles,rows.join('\n')+'\n');
 fs.writeFileSync(updateChecks,checks.join('\n'));
 return {cleanup,updateFiles,updateChecks,changed:changed.length,kept:kept.length,obsolete:obsolete.size};
}
module.exports={buildIncludes,fileHash,packageFiles};

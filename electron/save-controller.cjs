class SaveController{
 constructor({engine,outputDir,flush,onSaving,onSaved,onStatus,onFailure,log=()=>{}}){Object.assign(this,{engine,outputDir,flush,onSaving,onSaved,onStatus,onFailure,log});this.pending=0;this.waiters=[];this.failureCount=0;this.lastFailure=null;}
 waitForIdle({failOnError=false}={}){const before=this.failureCount,drained=this.pending?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();return drained.then(()=>{if(failOnError&&this.failureCount!==before)throw this.lastFailure;});}
 async save(kind='replay',requestedAt=Date.now(),trigger='button'){
  this.pending++;this.onStatus?.({pending:this.pending});this.log({event:'save-request',kind,requestedAt,trigger});
  try{this.onSaving?.({kind,requestedAt,trigger,pending:this.pending});const clip=await this.engine.save(this.outputDir(),kind,{requestedAt,beforeSnapshot:()=>this.flush()});await this.onSaved(clip);this.log({event:'save-complete',id:clip.id,duration:clip.duration,start:clip.startTime,end:clip.endTime,trigger});return clip;}
  catch(error){this.failureCount++;this.lastFailure=error;this.log({event:'save-error',message:error.message,trigger});this.onFailure?.(error);throw error;}
  finally{this.pending--;this.onStatus?.({pending:this.pending});if(!this.pending)this.waiters.splice(0).forEach(resolve=>resolve());}
 }
}
module.exports={SaveController};

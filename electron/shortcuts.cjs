const {parseAccelerator}=require('./shared-shortcuts.cjs');
function shortcutSignature(value){const parsed=parseAccelerator(value);return parsed?`${parsed.modifiers}:${parsed.key}`:value.toLowerCase();}
class ShortcutManager{
 constructor(native,dispatch,shared){this.native=native;this.dispatch=dispatch;this.shared=shared;this.status=[];this.recent=new Map();}
 trigger(action,at=Date.now(),source='global'){
  if(this.editing)return false;
  // Pair one notification from each backend, rather than throttling the action:
  // fast separate presses must still produce separate replay requests.
  const queue=(this.recent.get(action)||[]).filter(e=>Math.abs(at-e.at)<=150),match=queue.findIndex(e=>e.source!==source);
  if(match>=0){queue.splice(match,1);this.recent.set(action,queue);return false;}
  queue.push({source,at});this.recent.set(action,queue.slice(-8));this.dispatch(action,at);return true;
 }
 apply(shortcuts){this.clear();if(this.editing)return {shortcuts:{...shortcuts},status:this.status,failed:[]};const used=new Set();this.status=Object.entries(shortcuts).map(([action,accelerator])=>{if(!accelerator)return {action,requested:accelerator,accelerator,registered:false,disabled:true,fallback:false,mode:'disabled'};const signature=shortcutSignature(accelerator);let registered=false,mode='global';if(!used.has(signature)){let global=false;try{global=this.native.register(accelerator,()=>this.trigger(action,Date.now(),'global'));}catch{}const observed=!!this.shared?.register(accelerator,action);registered=global||observed;mode=observed?(global?'global+shared':'shared'):'global';}if(registered)used.add(signature);return {action,requested:accelerator,accelerator,registered,fallback:false,mode};});return {shortcuts:{...shortcuts},status:this.status,failed:this.status.filter(s=>!s.registered&&!s.disabled).map(s=>s.requested)};}
 clear(){this.native.unregisterAll();this.shared?.clear();this.recent.clear();}
}
module.exports={ShortcutManager,shortcutSignature};

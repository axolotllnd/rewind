const {parseAccelerator}=require('./shared-shortcuts.cjs');
function shortcutSignature(value){const parsed=parseAccelerator(value);return parsed?`${parsed.modifiers}:${parsed.key}`:value.toLowerCase();}
class ShortcutManager{
 constructor(native,dispatch,shared){this.native=native;this.dispatch=dispatch;this.shared=shared;this.status=[];}
 apply(shortcuts){this.clear();if(this.editing)return {shortcuts:{...shortcuts},status:this.status,failed:[]};const used=new Set();this.status=Object.entries(shortcuts).map(([action,accelerator])=>{if(!accelerator)return {action,requested:accelerator,accelerator,registered:false,disabled:true,fallback:false,mode:'disabled'};const signature=shortcutSignature(accelerator);let registered=false,mode='global';if(!used.has(signature)){try{registered=this.native.register(accelerator,()=>this.dispatch(action,Date.now()));}catch{}if(!registered){registered=!!this.shared?.register(accelerator,action);mode='shared';}}if(registered)used.add(signature);return {action,requested:accelerator,accelerator,registered,fallback:false,mode};});return {shortcuts:{...shortcuts},status:this.status,failed:this.status.filter(s=>!s.registered&&!s.disabled).map(s=>s.requested)};}
 clear(){this.native.unregisterAll();this.shared?.clear();}
}
module.exports={ShortcutManager,shortcutSignature};

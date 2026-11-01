export function createPreviewBus(context){
 const input=context.createGain(),compressor=context.createDynamicsCompressor(),ceiling=context.createWaveShaper();
 compressor.threshold.value=-3;compressor.knee.value=4;compressor.ratio.value=16;compressor.attack.value=.003;compressor.release.value=.12;
 const curve=new Float32Array(32769);
 for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.85?a:.85+.09*Math.tanh((a-.85)/.09));}
 ceiling.curve=curve;ceiling.oversample='2x';input.connect(compressor);compressor.connect(ceiling);ceiling.connect(context.destination);
 return {input,close(){input.disconnect();compressor.disconnect();ceiling.disconnect();}};
}
export class PreviewAudio{
 constructor(elements){this.context=new AudioContext({latencyHint:'playback'});this.bus=createPreviewBus(this.context);this.tracks=new Map();for(const [index,element] of Object.entries(elements)){element.muted=false;element.volume=1;const source=this.context.createMediaElementSource(element),gain=this.context.createGain();source.connect(gain);gain.connect(this.bus.input);this.tracks.set(+index,{source,gain});}}
 configure(audio){for(const [index,track] of this.tracks){const state=audio.find(a=>a.index===index);track.gain.gain.setTargetAtTime(state?.enabled?state.gain/100:0,this.context.currentTime,.008);}}
 resume(){return this.context.resume();}
 close(){for(const track of this.tracks.values()){track.source.disconnect();track.gain.disconnect();}this.bus.close();this.context.close().catch(()=>{});}
}

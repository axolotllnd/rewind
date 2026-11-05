// Look-ahead limiting prevents codec clipping without automatic makeup gain.
const limiter='alimiter=limit=0.94:attack=5:release=80:level=false:latency=true';
function mixFilter(sources,output='out'){
 const labels=sources.map((source,index)=>`[${output}_${index}]`);
 const inputs=sources.map((source,index)=>`[${source.inputIndex??index}:a]volume=${source.gain/100}${labels[index]}`);
 return [...inputs,`${labels.join('')}amix=inputs=${sources.length}:duration=longest:normalize=0,${limiter}[${output}]`].join(';');
}
module.exports={limiter,mixFilter};

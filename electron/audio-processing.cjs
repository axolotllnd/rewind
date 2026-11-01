// Look-ahead limiting prevents codec clipping without automatic makeup gain.
const limiter='alimiter=limit=0.94:attack=5:release=80:level=false:latency=true';
function mixFilter(sources){return sources.map((a,i)=>`[${i}:a]volume=${a.gain/100}[a${i}]`).concat(sources.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${sources.length}:duration=longest:normalize=0,${limiter}[out]`).join(';');}
module.exports={limiter,mixFilter};

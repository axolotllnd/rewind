import React,{useEffect,useRef,useState} from 'react';
import {Play,VideoCamera} from '@phosphor-icons/react';
const cache=new Map();
export default function ClipThumbnail({clip,hover=true}){
 const box=useRef(),video=useRef(),[media,setMedia]=useState(null),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[over,setOver]=useState(false);
 useEffect(()=>{let alive=true;setReady(false);setFailed(false);setMedia(null);const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();if(!window.rewind?.thumbnail){setFailed(true);return;}const key=clip.id||clip.name;if(!cache.has(key))cache.set(key,window.rewind.thumbnail(key).catch(e=>{cache.delete(key);throw e;}));cache.get(key).then(m=>{if(alive)setMedia(m);}).catch(()=>{if(alive)setFailed(true);});},{rootMargin:'120px'});observer.observe(box.current);return()=>{alive=false;observer.disconnect();};},[clip.id,clip.path]);
 useEffect(()=>{const v=video.current;if(!v)return;if(over)v.play().catch(()=>{});else{v.pause();v.currentTime=0;}},[over,media]);
 return <span ref={box} className={`clip-thumbnail ${ready?'ready':''} ${failed?'failed':''}`} onPointerEnter={()=>hover&&setOver(true)} onPointerLeave={()=>setOver(false)}>{media?.image&&<img src={media.image} alt="" draggable="false" onLoad={()=>setReady(true)} onError={()=>setFailed(true)}/>} {hover&&over&&media?.video&&<video ref={video} src={media.video} muted loop playsInline preload="none" aria-hidden="true"/>}{failed?<VideoCamera size={22}/>:!ready?<span className="thumbnail-skeleton"/>:<Play className="thumbnail-play" size={22} weight="fill"/>}</span>;
}

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Pause, SpeakerHigh, SpeakerSlash, Scissors, Export, CheckCircle, X, Info, CornersOut, CornersIn, ArrowCounterClockwise } from '@phosphor-icons/react';
import { IconButton, Toggle, Select, NumberField, duration } from './ui';
import { t, f } from './i18n';
import ClipThumbnail from './ClipThumbnail';
import {PreviewAudio} from './preview-audio';
import {ConfirmDialog} from './ui';
const api = window.rewind;
function Wave({
  peaks
}) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1280, 64);
    ctx.fillStyle = '#b9a683';
    peaks.forEach((v, i) => {
      const h = Math.max(1, Math.min(60, v * 58));
      ctx.fillRect(i * 4, 32 - h / 2, 2, h);
    });
  }, [peaks]);
  return <canvas ref={ref} width="1280" height="64" className="audio-wave" />;
}
export default function Editor({
  clip,library=[],onSwitch,
  onBack,
  onExported,
  onBusyChange,
  language
}) {
  const [meta, setMeta] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [buffering, setBuffering] = useState(true),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [edit, setEdit] = useState(null),
    [progress, setProgress] = useState(null),
    [job, setJob] = useState(null),
    [saved, setSaved] = useState(false),
    [fullscreen, setFullscreen] = useState(false),[switchTarget,setSwitchTarget]=useState(null),[dirty,setDirty]=useState(false);
  const loadGeneration=useRef(0),muteSnapshot=useRef([]),previewAudio=useRef();
  const video = useRef(),
    player = useRef(),
    audios = useRef({}),
    timeline = useRef(),
    editRef = useRef();
  editRef.current = edit;
  useEffect(()=>{onBusyChange?.(!!job);},[job,onBusyChange]);
  useEffect(()=>{
    const changed=()=>setFullscreen(document.fullscreenElement===player.current);
    document.addEventListener('fullscreenchange',changed);
    return()=>document.removeEventListener('fullscreenchange',changed);
  },[]);
  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await player.current.requestFullscreen();
    }catch{setError(t('Не удалось включить полный экран. Повтори попытку.'));}
  }
  async function load() {
    const generation=++loadGeneration.current;setLoading(true);setBuffering(true);setPlaying(false);setTime(0);setSaved(false);setDirty(false);setMeta(null);
    setError('');
    try {
      const m = await api.preview(clip.id || clip.name);
      if(generation!==loadGeneration.current)return;setMeta(m);
      setEdit({
        start: 0,
        end: m.duration,
        width: m.width % 2 ? m.width - 1 : m.width,
        height: m.height % 2 ? m.height - 1 : m.height,
        fps: Math.min(240, Math.round(m.fps)),
        bitrate: 12,
        targetMB: 0,
        aspect: 'original',
        fit: 'contain',
        mix: true,
        audio: m.audio.map(a => ({
          index: a.index,
          enabled: true,
          gain: 100
        }))
      });
    } catch (e) {
      if(generation===loadGeneration.current)setError(e.message);
    } finally {
      if(generation===loadGeneration.current)setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      loadGeneration.current++;video.current?.pause();Object.values(audios.current).forEach(a => a.pause());
    };
  }, [clip.id || clip.name]);
  useEffect(() => {
    if (!api) return;
    return api.onExportProgress(value => {
      if (value.id === job) setProgress(value.progress);
    });
  }, [job]);
  useEffect(() => {
    if (!edit) return;
    previewAudio.current?.configure(edit.audio);
  }, [edit?.audio]);
  useEffect(()=>{const stop=()=>{video.current?.pause();Object.values(audios.current).forEach(a=>a.pause());setPlaying(false);};const visible=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',visible);const off=api?.onPausePlayback?.(stop);return()=>{off?.();document.removeEventListener('visibilitychange',visible);};},[]);
  useEffect(()=>{if(!meta)return;const v=video.current,tracks=Object.values(audios.current);if(tracks.length){previewAudio.current=new PreviewAudio(audios.current);previewAudio.current.configure(editRef.current.audio);}return()=>{v?.pause();tracks.forEach(a=>{a.pause();a.removeAttribute('src');a.load();});previewAudio.current?.close();previewAudio.current=null;};},[meta]);
  function update(patch) {
    setDirty(true);
    setEdit(e => ({
      ...e,
      ...patch
    }));
    setSaved(false);
  }
  function seek(value) {
    if (!video.current || !edit) return;
    const position = Math.max(0, Math.min(meta.duration, value));
    video.current.currentTime = position;
    setTime(position);
    for (const a of Object.values(audios.current)) {
      if (Number.isFinite(a.duration)) a.currentTime = Math.min(a.duration, position);
    }
  }
  async function playPause() {
    const v = video.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
      return;
    }
    if (v.currentTime < edit.start || v.currentTime >= edit.end - .05) seek(edit.start);
    try {
      await previewAudio.current?.resume();await v.play();
    } catch (e) {
      setError(e.message);
    }
  }
  function syncPlay() {
    setPlaying(true);previewAudio.current?.resume();
    Object.values(audios.current).forEach(a => {
      a.currentTime = video.current.currentTime;
      a.play().catch(() => {});
    });
  }
  function pause() {
    setPlaying(false);
    Object.values(audios.current).forEach(a => a.pause());
  }
  function tick() {
    const v = video.current;
    if (!v) return;
    setTime(v.currentTime);
    if (v.currentTime >= editRef.current.end) {
      v.pause();
      seek(editRef.current.end);
    } else Object.values(audios.current).forEach(a => {
      if (Math.abs(a.currentTime - v.currentTime) > .15) a.currentTime = v.currentTime;
    });
  }
  function drag(e, side) {
    if (!e.buttons) return;
    const r = timeline.current.getBoundingClientRect(),
      value = Math.max(0, Math.min(meta.duration, (e.clientX - r.left) / r.width * meta.duration));
    if (side === 'start') {
      const start = Math.min(edit.end - .1, value);
      update({
        start
      });
      seek(start);
    } else update({
      end: Math.max(edit.start + .1, value)
    });
  }
  function scrub(e){if(e.target.closest('button'))return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*meta.duration);}
  function scrubMove(e){if(e.buttons&&e.currentTarget.hasPointerCapture(e.pointerId)){const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/r.width*meta.duration);}}
  function muteAll(){if(edit.audio.some(a=>a.enabled)){muteSnapshot.current=edit.audio;update({audio:edit.audio.map(a=>({...a,enabled:false}))});}else update({audio:edit.audio.map(a=>({...a,enabled:muteSnapshot.current.find(v=>v.index===a.index)?.enabled??true}))});}
  function aspect(value) {
    let width = meta.width,
      height = meta.height;
    if (value === '16:9') {
      width = 1920;
      height = 1080;
    }
    if (value === '9:16') {
      width = 1080;
      height = 1920;
    }
    if (value === '1:1') {
      width = 1080;
      height = 1080;
    }
    update({
      aspect: value,
      width: Math.floor(width / 2) * 2,
      height: Math.floor(height / 2) * 2
    });
  }
  function preset(height) {
    const ratio = edit.width / edit.height;
    update({
      height,
      width: Math.max(64, Math.round(height * ratio / 2) * 2)
    });
  }
  async function exportClip() {
    video.current?.pause();
    const id = crypto.randomUUID();
    setJob(id);
    setProgress(0);
    setError('');
    try {
      const c = await api.exportClip(clip.id || clip.name, edit, id);
      if (c) {
        onExported(c);
        setSaved(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setJob(null);
      setProgress(null);
    }
  }
  const selected = edit?.audio.filter(a => a.enabled) || [],
    length = edit ? edit.end - edit.start : 0,
    estimate = edit?.targetMB || length * ((edit?.bitrate || 0) + (selected.length ? (edit?.mix ? 1 : selected.length) * .192 : 0)) / 8;
  return <div className="editor"><div className="editor-heading"><button className="text-btn" onClick={onBack} disabled={!!job}><ArrowLeft size={18} />{t('Библиотека')}</button><div><h1>{clip.title || clip.name.replace(/\.[^.]+$/, '')}</h1><p>{clip.resolution}p · {clip.fps} FPS · {Math.round(clip.size / 1024 ** 2)} MB</p></div><span className="editor-original"><CheckCircle size={15} />{t('Оригинал сохранён')}</span></div>{error && <div className="error-banner" role="alert">{error}<button className="text-btn" onClick={load}>{t('Повторить')}</button></div>}
 {loading ? <div className="editor-loading"><div className="loading-ring" /><h2>{t('Готовим видео к просмотру')}</h2><p>{t('Загружаем дорожки и строим звуковые волны.')}</p></div> : meta && edit && <><div className="editor-layout"><div className="editor-view" ref={player}><div className="video-stage"><div className="video-canvas" style={{
              aspectRatio: `${edit.width}/${edit.height}`
            }}><video ref={video} muted src={meta.url} preload="auto" style={{
                objectFit: edit.fit === 'crop' ? 'cover' : 'contain'
              }} onLoadedData={() => setBuffering(false)} onWaiting={() => {setBuffering(true);Object.values(audios.current).forEach(a=>a.pause());}} onCanPlay={() => setBuffering(false)} onPlaying={() => {setBuffering(false);syncPlay();}} onPlay={()=>setPlaying(true)} onPause={pause} onTimeUpdate={tick} onEnded={pause} onSeeking={() => {
                setBuffering(true);
                Object.values(audios.current).forEach(a => {
                  a.currentTime = video.current.currentTime;
                });
              }} onSeeked={() => {setBuffering(false);if(!video.current.paused)syncPlay();}} onClick={playPause} onError={() => setError(t('Не удалось открыть видео. Попробуй импортировать исходный файл ещё раз.'))} />{buffering && <div className="video-loading"><div className="loading-ring" /><span>{t('Загрузка видео…')}</span></div>}</div></div><div className="transport"><IconButton label={playing ? t('Пауза') : t('Воспроизвести')} onClick={playPause}>{playing ? <Pause size={23} weight="fill" /> : <Play size={23} weight="fill" />}</IconButton><span className="transport-time">{duration(time)} <span>/ {duration(meta.duration)}</span></span><input type="range" min={edit.start} max={edit.end} step="0.01" value={Math.max(edit.start, Math.min(edit.end, time))} aria-label={t('Позиция воспроизведения')} onChange={e => seek(+e.target.value)} /><IconButton label={fullscreen ? t('Выйти из полного экрана') : t('Полный экран')} onClick={toggleFullscreen}>{fullscreen ? <CornersIn size={19} /> : <CornersOut size={19} />}</IconButton></div></div>
 <aside className="editor-options"><h2>{t('Экспорт клипа')}</h2><Select label={t('Формат кадра')} value={edit.aspect} onChange={aspect}><option value="original">{t('Оригинал')}</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></Select><div className="export-presets">{[480, 720, 1080, 1440, 2160].map(n => <button key={n} className={edit.height === n ? 'selected' : ''} onClick={() => preset(n)}>{n}p</button>)}</div><div className="number-grid"><NumberField label={t('Ширина')} value={edit.width} min={64} max={7680} step={2} onChange={width => update({
              width
            })} /><NumberField label={t('Высота')} value={edit.height} min={64} max={4320} step={2} onChange={height => update({
              height
            })} /></div><Select label={t('Масштабирование')} value={edit.fit} onChange={fit => update({
            fit
          })}><option value="contain">{t('Вписать с полями')}</option><option value="crop">{t('Заполнить и обрезать')}</option></Select><div className="number-grid"><NumberField label="FPS" value={edit.fps} min={1} max={240} onChange={fps => update({
              fps
            })} /><NumberField label={t('Мбит/с')} value={edit.bitrate} min={.25} max={150} step={.25} onChange={bitrate => update({
              bitrate,
              targetMB: 0
            })} /></div><NumberField label={t('Желаемый размер, МБ (0 — без цели)')} value={edit.targetMB} min={0} max={100000} step={1} onChange={targetMB => update({
            targetMB
          })} /><p className="export-estimate">≈ {estimate.toFixed(1)} MB · MP4 / H.264</p><p className="editor-small">{t('Размер ориентировочный: зависит от длительности и сложности изображения.')}</p><div className="setting-row"><h3>{t('Смешать звук в одну дорожку')}</h3><Toggle label={t('Смешать звук')} value={edit.mix} onChange={mix => update({
              mix
            })} /></div><button className="primary-btn export-action" onClick={exportClip} disabled={!!job}><Export size={18} />{job ? `${t('Экспорт…')} ${Math.round((progress || 0) * 100)}%` : t('Экспортировать MP4')}</button>{job && <><div className="export-progress"><span style={{
                transform: `scaleX(${progress || 0})`
              }} /></div><button className="text-btn" onClick={() => api.cancelExport(job)}>{t('Отменить экспорт')}</button></>}{saved && <p className="export-success"><CheckCircle size={17} />{t('Копия сохранена в библиотеке')}</p>}</aside></div>
 <section className="editor-timeline"><div className="section-line"><h2><Scissors size={19} />{t('Обрезка')}</h2><span className="editor-small">{t('Выбрано')} {duration(length)}</span><button className="text-btn" onClick={() => {
            update({
              start: 0,
              end: meta.duration
            });
            seek(0);
          }}><ArrowCounterClockwise size={16} />{t('Сбросить')}</button></div><div className="trim-ruler"><span>00:00</span><span>{duration(meta.duration / 4)}</span><span>{duration(meta.duration / 2)}</span><span>{duration(meta.duration * 3 / 4)}</span><span>{duration(meta.duration)}</span></div><div className="trim-track" ref={timeline} onPointerDown={scrub} onPointerMove={scrubMove} role="slider" tabIndex={0} aria-label={t('Позиция на шкале обрезки')} aria-valuemin={0} aria-valuemax={meta.duration} aria-valuenow={time} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();seek(time+(e.key==='ArrowRight'?1:-1));}}}><div className="trim-before" style={{
            width: `${edit.start / meta.duration * 100}%`
          }} /><div className="trim-selection" style={{
            left: `${edit.start / meta.duration * 100}%`,
            right: `${(1 - edit.end / meta.duration) * 100}%`
          }} /><button className="trim-handle start" aria-label={t('Начало обрезки')} style={{
            left: `${edit.start / meta.duration * 100}%`
          }} onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e => drag(e, 'start')} /><button className="trim-handle end" aria-label={t('Конец обрезки')} style={{
            left: `${edit.end / meta.duration * 100}%`
          }} onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e => drag(e, 'end')} /><span className="playhead" style={{
            left: `${time / meta.duration * 100}%`
          }} /></div><div className="trim-inputs"><NumberField label={t('Начало, сек')} value={+edit.start.toFixed(2)} min={0} max={edit.end - .1} step={.01} onChange={start => {
            update({
              start
            });
            seek(start);
          }} /><NumberField label={t('Конец, сек')} value={+edit.end.toFixed(2)} min={edit.start + .1} max={meta.duration} step={.01} onChange={end => update({
            end
          })} /><span>{t('Экспортируется только выделенная часть. Оригинал не меняется.')}</span></div>
 <div className="timeline-audio-heading"><h3>{t('Звуковые дорожки')}</h3><button className="text-btn" onClick={muteAll}>{selected.length?<SpeakerSlash size={17}/>:<SpeakerHigh size={17}/>} {selected.length?t('Убрать весь звук'):t('Включить звук')}</button></div>{meta.audio.length ? meta.audio.map(a => {
          const state = edit.audio.find(x => x.index === a.index);
          return <div key={a.index} className={`editor-audio-track ${state.enabled ? '' : 'muted-track'}`}><div className="editor-track-controls"><IconButton label={state.enabled ? t('Выключить дорожку') : t('Включить дорожку')} onClick={() => update({
                audio: edit.audio.map(x => x.index === a.index ? {
                  ...x,
                  enabled: !x.enabled
                } : x)
              })}>{state.enabled ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}</IconButton><span title={a.name}>{a.name}</span><input type="range" min="0" max="100" value={state.gain} aria-label={t('Громкость дорожки')} onChange={e => update({
                audio: edit.audio.map(x => x.index === a.index ? {
                  ...x,
                  gain: +e.target.value
                } : x)
              })} /><span>{state.gain}%</span></div><div className="wave-track" onPointerDown={scrub} onPointerMove={scrubMove}><Wave peaks={a.peaks} /><div className="wave-selection" style={{
                left: `${edit.start / meta.duration * 100}%`,
                width: `${(edit.end - edit.start) / meta.duration * 100}%`
              }} /></div><audio ref={el => {
              if (el) audios.current[a.index] = el;else delete audios.current[a.index];
            }} src={a.url} crossOrigin="anonymous" preload="auto" /></div>;
        }) : <p className="muted">{t('В этом видео нет аудио.')}</p>}</section></>}
 <section className="clip-browser"><div className="section-line"><h2>{t('Другие моменты')}</h2><span className="muted">{library.findIndex(c=>c.id===clip.id)+1} / {library.length}</span></div><div className="clip-browser-strip">{library.map(c=><button key={c.id} className={c.id===clip.id?'current':''} disabled={!!job} aria-current={c.id===clip.id?'true':undefined} onClick={()=>{if(c.id===clip.id)return;video.current?.pause();if(dirty)setSwitchTarget(c);else onSwitch(c);}}><ClipThumbnail clip={c} hover={false}/><strong>{c.title||c.name}</strong><span>{duration(c.duration)}</span></button>)}</div></section>{switchTarget&&<ConfirmDialog title={t('Открыть другой клип?')} cancelLabel={t('Остаться')} confirmLabel={t('Открыть')} onCancel={()=>setSwitchTarget(null)} onConfirm={()=>{onSwitch(switchTarget);setSwitchTarget(null);}}>{t('Настройки обрезки и экспорта будут сброшены. Оригинал сохранён.')}</ConfirmDialog>}
 </div>;
}

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Rewind, Record, VideoCamera, Monitor, GameController, Images, SlidersHorizontal, Keyboard, SpeakerHigh, Microphone, GearSix, ArrowUpRight, ArrowRight, FolderOpen, Plus, X, Minus, CornersOut, CornersIn, Check, Sun, Moon, Play, Stop, Clock, HardDrives, Info, WarningCircle, ArrowCounterClockwise, CaretRight, Trash, Waveform, CheckCircle, DesktopTower, Question, FloppyDisk, Pause } from '@phosphor-icons/react';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import { Recorder } from './capture';
import { AudioPage, SettingsPage, LibraryPage, ClipRow } from './Panels';
import Editor from './Editor';
import HotkeysPage from './Hotkeys';
import {SupportDialog,CommunityLinks} from './Community';
import { NumberField, ConfirmDialog } from './ui';
import { t, f, setLocale } from './i18n';
import './style.css';
const native = !!window.rewind;
const initial = {
  soundEnabled:true,
  soundVolume:35,
  theme: 'dark',
  language: 'ru',
  width: 1920,
  resolution: 1080,
  fps: 60,
  bitrate: 20,
  codec: 'auto',
  outputFormat: 'mp4',
  replaySeconds: 30,
  maxBufferMB: 1024,
  outputDir: '',
  launchAtLogin: false,
  minimizeToTray: true,
  notifications: true,
  notificationPosition: 'top-right',
  sourceType: 'screen',
  sourceId: '',
  sourceName: '',
  shortcuts: {
    replay: 'Alt+F10',
    record: 'Alt+F9',
    toggle: 'Alt+Shift+F10'
  },
  audio: [{
    id: 'system',
    label: t("Звук компьютера"),
    deviceId: 'system',
    enabled: true,
    track: 1,
    gain: 100
  }, {
    id: 'mic',
    label: t("Микрофон"),
    deviceId: 'default',
    enabled: false,
    track: 2,
    gain: 100
  }]
};
const api = window.rewind;
const duration = n => {
  n = Math.max(0, Math.floor(n || 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const bytes = n => n >= 1024 ** 3 ? f("{0} ГБ", (n / 1024 ** 3).toFixed(1)) : f("{0} МБ", Math.round((n || 0) / 1024 ** 2));
function IconButton({
  label,
  children,
  ...props
}) {
  return <button className="icon-btn" title={label} aria-label={label} {...props}>{children}</button>;
}
function Toggle({
  value,
  onChange,
  label,
  disabled
}) {
  return <button type="button" className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} disabled={disabled}><span /></button>;
}
function Keycap({
  value
}) {
  return <span className="key-combo">{value.split('+').map((k, i) => <React.Fragment key={i}>{i > 0 && <span className="key-plus">+</span>}<kbd>{k}</kbd></React.Fragment>)}</span>;
}
function Select({
  label,
  value,
  onChange,
  children,
  disabled
}) {
  return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{children}</select></label>;
}
function App() {
  const [cfg, setCfg] = useState(() => {
      try {
        return {
          ...initial,
          ...JSON.parse(localStorage.getItem('rewind-preview') || '{}')
        };
      } catch {
        return initial;
      }
    }),
    [page, setPage] = useState('capture'),
    [library, setLibrary] = useState([]),
    [stats, setStats] = useState({}),
    [active, setActive] = useState(false),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(''),
    [picker, setPicker] = useState(false),
    [source, setSource] = useState(null),
    [toast, setToast] = useState(null),
    [error, setError] = useState(''),
    [actual, setActual] = useState(null),
    [help, setHelp] = useState(false),
    [ready, setReady] = useState(false),
    [supportOpen,setSupportOpen]=useState(false),
    [editor, setEditor] = useState(null),[editorBusy,setEditorBusy]=useState(false),[leaveTarget,setLeaveTarget]=useState(null),[windowState,setWindowState]=useState({maximized:false}),[shortcutStates,setShortcutStates]=useState([]),[savePending,setSavePending]=useState(0);
  setLocale(cfg.language || 'ru');
  const cfgRef = useRef(cfg),
    seq = useRef(0),
    noticeTimer = useRef(),
    recorder = useRef(null),
    commandRef = useRef(),
    captureGeneration = useRef(0);
  function notice(title, detail) {
    setToast({
      title,
      detail
    });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setToast(null), 5000);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = cfg.theme;
    cfgRef.current = cfg;
  }, [cfg]);
  useEffect(() => {
    if (native) {
      api.init().then(s => {
        setCfg(s.config);
        setSupportOpen(!!s.showSupport);
        cfgRef.current = s.config;
        setWindowState(s.windowState||{maximized:false});
        if(s.captureState){setActive(s.captureState.active);setRecording(s.captureState.recording);setActual(s.captureState.actual);if(s.captureState.active){recorder.current=new Recorder(api,()=>{});recorder.current.remote=true;recorder.current.active=true;}}
        setLibrary(s.library);setShortcutStates(s.shortcutStatus||[]);
        setReady(true);
      }).catch(e => {
        setError(e.message);
        setReady(true);
      });
      const unsub = api.onNotice(n => notice(n.title, n.detail)),
        unsub2 = api.onCommand(c => commandRef.current?.(c)),
        unsub3 = api.onError(message => {
          setError(message);
          commandRef.current?.('error');
        });
      const unsub4=api.onFlush(async id=>{try{if(!recorder.current?.active)throw new Error(t('Захват ещё не готов'));await recorder.current.flush();await api.flushed(id);}catch(e){await api.flushed(id,e.message);}});
      const unsub5=api.onClipSaved(clip=>{setLibrary(l=>[clip,...l.filter(c=>c.id!==clip.id)]);if(clip.kind==='record')setRecording(false);api.stats().then(setStats).catch(()=>{});});
      const unsub6=api.onSaveStatus(state=>setSavePending(state.pending));
      const unsub7=api.onShortcuts(setShortcutStates);
      const unsubCapture=api.onCaptureState?.(state=>{if(state.config){setCfg(state.config);cfgRef.current=state.config;}setActive(state.active);setRecording(state.recording);setActual(state.actual);if(state.active&&!recorder.current){recorder.current=new Recorder(api,()=>{});recorder.current.remote=true;recorder.current.active=true;}});
      const unsub8=api.onWindowState(setWindowState);
      return () => {unsub();unsub2();unsub3();unsub4();unsub5();unsub6();unsub7();unsub8();unsubCapture?.();};
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!native || !ready) return;
    let disposed = false;
    const update = () => api.stats().then(s => {
      if (!disposed) setStats(s);
    }).catch(() => {});
    update();
    const id = setInterval(update, active ? 1000 : 5000);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [active, ready]);
  useEffect(() => {
    const listener = e => {
      if (e.key === 'Escape') {
        setPicker(false);
        setHelp(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  function navigate(nextPage) {
    if(editor){
      if(editorBusy){notice(t('Идёт экспорт'),t('Дождись завершения или отмени экспорт в редакторе.'));return;}
      setLeaveTarget(nextPage);
    }else {setPage(nextPage);api?.sound?.('tap');}
  }
  function openEditor(clip){setPage('library');setEditorBusy(false);setEditor(clip);}
  function leaveEditor(){setEditor(null);setEditorBusy(false);setPage(leaveTarget);setLeaveTarget(null);}
  async function configure(patch) {
    if(patch.language){setToast(null);clearTimeout(noticeTimer.current);}
    const n = ++seq.current;
    const previous = cfgRef.current;
    const next = {
      ...previous,
      ...patch
    };
    cfgRef.current = next;
    setCfg(next);
    try {
      if (native) {
        const confirmed = await api.configure(patch);
        if (n === seq.current) {
          setCfg(confirmed);
          cfgRef.current = confirmed;
        }
      } else localStorage.setItem('rewind-preview', JSON.stringify(next));
    } catch (e) {
      if (n === seq.current) {
        setCfg(previous);
        cfgRef.current = previous;
      }
      notice(t("Не удалось изменить настройку"), e.message);
    }
  }
  async function startCapture() {
    if (!native) {
      notice(t("Открой приложение REWIND"), t("Захват экрана и глобальные бинды работают в версии для Windows."));
      return false;
    }
    if (!cfgRef.current.sourceId) {
      setPicker(true);
      return false;
    }
    setBusy('start');
    setError('');
    const generation = ++captureGeneration.current;
    try {
      recorder.current = new Recorder(api, s => {
        if (s.error) {
          setError(s.error);
          if (s.ended) commandRef.current?.('error');
        }
        if (s.actual) setActual(s.actual);
      });
      await recorder.current.start(cfgRef.current);
      if (generation !== captureGeneration.current) {
        await recorder.current.stop();
        return false;
      }
      setActive(true);
      await api.notify({
        title: t("Мгновенный повтор включён"),
        detail: f("Буфер {0} с · {1}", cfgRef.current.replaySeconds, cfgRef.current.sourceName)
      });
      return true;
    } catch (e) {
      if(!e.message.includes('CAPTURE_START_CANCELLED'))setError(e.message);
      return false;
    } finally {
      setBusy('');
    }
  }
  async function saveClip(kind) {
    const requestedAt=Date.now();if (busy) return;
    setBusy('save');
    try {
      const clip = await api.save(kind,requestedAt);
      setLibrary(l => [clip, ...l.filter(c=>c.id!==clip.id)]);
      if (kind === 'record') setRecording(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  async function stopCapture() {
    if (busy||savePending>0) return;
    if (recording) {
      setBusy('save');
      try {
        const clip = await api.save('record',Date.now());
        setLibrary(l => [clip, ...l.filter(c=>c.id!==clip.id)]);
        setRecording(false);
      } catch (e) {
        setError(e.message);
        setBusy('');
        return;
      }
    }
    setBusy('stop');
    try {
      await recorder.current?.stop();
      setActive(false);
      setActual(null);
      setStats({});
      await api.notify({
        title: t("Захват остановлен"),
        detail: t("Сохранённые клипы доступны в библиотеке")
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }
  async function toggleRecord() {
    if (busy||savePending>0) return;
    if (recording) return saveClip('record');
    let ok = active;
    if (!ok) ok = await startCapture();
    if (!ok) return;
    try {
      await api.record();
      setRecording(true);
    } catch (e) {
      setError(e.message);
    }
  }
  commandRef.current = async c => {
    if (c === 'error') {
      captureGeneration.current++;
      try {
        await recorder.current?.stop();
      } catch {}
      setActive(false);
      setRecording(false);
      setActual(null);
      setBusy('');
      return;
    }
    if (busy) {notice(t('Идёт сохранение'),t('Повтори команду после завершения'));return;}
    if (c === 'replay') {
      if (active) saveClip('replay');else notice(t("Буфер выключен"), t("Включи мгновенный повтор заранее."));
    }
    if (c === 'record') toggleRecord();
    if (c === 'toggle') active ? stopCapture() : startCapture();
  };
  if (!ready) return <div className="app-splash"><Rewind size={50} weight="fill" /><strong>rewind.</strong><div className="loading-ring" /><p>{t("Загружаем твоё пространство…")}</p></div>;
  const locked = active || !!busy || savePending>0;
  const title = {
    capture: t("Центр записи"),
    library: t("Твои моменты"),
    audio: t("Звук и дорожки"),
    hotkeys: t("Горячие клавиши"),
    settings: t("Настройки")
  }[page];
  const enabledAudio = cfg.audio.filter(a => a.enabled),
    trackCount = new Set(enabledAudio.map(a => a.track)).size;
  const sourceButton = () => {
    if (!active) setPicker(true);
  };
  return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><Rewind size={30} weight="fill" /><span>rewind<span className="brand-dot">.</span></span></div>
   <div className="workspace-label">{t("ТВОЁ ПРОСТРАНСТВО")}</div>
   <nav aria-label={t("Основная навигация")}>{[['capture', VideoCamera, t("Запись")], ['library', Images, t("Библиотека")], ['audio', Waveform, t("Звук")], ['hotkeys', Keyboard, t("Бинды")]].map(([id, Icon, label]) => <button key={id} aria-label={label} className={`nav-item ${page === id ? 'selected' : ''}`} onClick={() => navigate(id)}><Icon size={20} weight={page === id ? 'fill' : 'regular'} /><span>{label}</span>{id === 'library' && library.length > 0 && <span className="count">{library.length}</span>}{page === id && <span className="nav-dot" />}</button>)}</nav>
   <div className="sidebar-bottom"><div className="sidebar-community"><CommunityLinks/></div><button aria-label={t("Настройки")} className={`nav-item ${page === 'settings' ? 'selected' : ''}`} onClick={() => navigate('settings')}><GearSix size={20} /><span>{t("Настройки")}</span></button><button aria-label={t("Как это работает")} className="nav-item" onClick={() => setHelp(true)}><Question size={20} /><span>{t("Как это работает")}</span><ArrowUpRight size={15} /></button><div className="version"><span>REWIND</span><span>v0.2.10 · WINDOWS</span></div></div>
  </aside>
  <div className="workspace">
   <div className="titlebar"><span className="titlebar-caption">{t("ЗАПИСЫВАЙ. СОХРАНЯЙ. ПЕРЕСМАТРИВАЙ.")}</span><div className="titlebar-controls">{native && <><IconButton label={t("Свернуть")} onClick={() => api.window('minimize')}><Minus size={16} /></IconButton><IconButton label={windowState.maximized ? t("Восстановить окно") : t("Развернуть")} onClick={() => api.window('maximize')}>{windowState.maximized ? <CornersIn size={15} /> : <CornersOut size={15} />}</IconButton><IconButton label={t("Закрыть в трей")} onClick={() => api.window('close')}><X size={17} /></IconButton></>}</div></div>
   <main key={editor?.id||page} className="page-transition">{editor ? <Editor clip={editor} library={library} onSwitch={openEditor} language={cfg.language} onBusyChange={setEditorBusy} onBack={() => navigate('library')} onExported={clip => setLibrary(l => [clip, ...l])} /> : <>
    <header className="page-header"><div><h1>{title}</h1><p>{{
                  capture: t("Будь в игре. Остальное мы запомним."),
                  library: t("Всё, что стоило сохранить."),
                  audio: t("Каждому источнику — своё место."),
                  hotkeys: t("Лучший момент не ждёт, пока ты откроешь окно."),
                  settings: t("Сделай REWIND своим.")
                }[page]}</p></div><div className={`status-tag ${active ? 'live' : ''}`}><span className="status-dot" />{!native ? t("Предпросмотр") : recording ? t("Идёт запись") : active ? t("Буфер включён") : t("Готов к записи")}</div></header>
    {!native && <div className="preview-note"><Info size={17} /><span>{t("Предпросмотр интерфейса. Для записи экрана запусти REWIND.exe.")}</span></div>}
    {shortcutStates.some(s=>s.fallback||(!s.registered&&!s.disabled))&&<div className="shortcut-warning" role="status"><Keyboard size={18}/><span>{shortcutStates.filter(s=>s.fallback||!s.registered).map(s=>s.registered?f('Бинд {0} занят. Назначен {1}.',s.requested,s.accelerator):f('Бинд {0} не зарегистрирован. Выбери другую комбинацию.',s.accelerator)).join(' ')}</span><button className="text-btn" onClick={()=>setPage('hotkeys')}>{t('Настроить бинды')}</button></div>}{error && <div className="error-banner" role="alert"><WarningCircle size={20} /><span>{error}</span><IconButton label={t("Закрыть сообщение")} onClick={() => setError('')}><X size={16} /></IconButton></div>}
    {page === 'capture' && <>
     <div className="capture-grid"><div className="capture-main">
      <section className={`source-preview ${source ? 'has-source' : ''}`} aria-label={t("Источник записи")}>
       {source?.thumbnail && <img className="source-image" src={source.thumbnail} alt={t("Выбранный источник захвата")} />}
       <div className="source-topline"><span className="source-badge">{cfg.sourceType === 'screen' ? <Monitor size={15} /> : <GameController size={15} />} {cfg.sourceName || t("ИСТОЧНИК НЕ ВЫБРАН")}</span><span className="preview-format">{cfg.resolution === 2160 ? '4K' : cfg.resolution === 1440 ? '2K' : 'FHD'}<span> / </span>{cfg.fps} FPS</span></div>
       {!source && <div className="preview-center"><Monitor size={74} weight="thin" /><span>{t("Место для твоих лучших моментов")}</span></div>}
       <div className="source-bottom"><div><h2>{active ? recording ? t("История уже пишется.") : t("Этот момент останется.") : t("Что будем записывать?")}</h2><p>{active ? t("Предпросмотр выключен, чтобы оставить ресурсы игре.") : t("Весь экран или только окно любимой игры.")}</p></div><button className="light-btn" onClick={sourceButton} disabled={active}>{cfg.sourceName ? t("Изменить") : t("Выбрать источник")}<ArrowUpRight size={18} /></button></div>
      </section>
      <section className="replay-panel"><div className="section-line"><h2><Rewind size={21} weight="fill" />{t("Мгновенный повтор")}</h2><Toggle label={t("Включить мгновенный повтор")} value={active} onChange={() => active ? stopCapture() : startCapture()} disabled={!!busy||savePending>0} /></div><p className="muted">{t("Сохраняй то, что уже произошло. Одним нажатием.")}</p><div className="buffer-control"><div className="buffer-number">{duration(cfg.replaySeconds)}<span>{t("длина повтора")}</span></div><div className="buffer-presets"><div className="segments">{[15, 30, 60, 120, 300].map(n => <button key={n} onClick={() => configure({
                          replaySeconds: n
                        })} disabled={locked} className={cfg.replaySeconds === n ? 'selected' : ''}>{n < 60 ? f("{0} с", n) : f("{0} мин", n / 60)}</button>)}</div><div className="buffer-usage"><span>{active ? f("В буфере {0} · {1}", duration(stats.bufferSeconds), bytes(stats.bufferBytes)) : t("Буфер начнёт наполняться после включения")}</span><span>{Math.round(cfg.bitrate * cfg.replaySeconds / 8)}{t(" МБ ≈")}</span></div></div></div><div className="custom-buffer"><NumberField label={t("Длина повтора, сек")} value={cfg.replaySeconds} min={1} max={1800} disabled={locked} onChange={replaySeconds => configure({
                      replaySeconds
                    })} /><span>{t("После повтора сохраняется только новый отрезок, не длиннее выбранного времени.")}</span></div><div className="buffer-track" role="progressbar" aria-label={t("Заполнение буфера")} aria-valuemin={0} aria-valuemax={cfg.replaySeconds} aria-valuenow={Math.floor(stats.bufferSeconds || 0)}><span style={{
                      width: `${Math.min(100, (stats.bufferSeconds || 0) / cfg.replaySeconds * 100)}%`
                    }} /></div><div className="replay-footer"><span className="shortcut-hint"><Keycap value={cfg.shortcuts.replay} /><span>{t("сохранить повтор")}</span></span><button className="text-btn" disabled={!active || !!busy || savePending>0 || (stats.bufferSeconds || 0) < .1} onClick={() => saveClip('replay')}>{busy === 'save'||savePending>0 ? t("Сохраняем…") : t("Сохранить сейчас")}<ArrowRight size={16} /></button></div></section>
      <section className={`record-row ${recording ? 'recording' : ''}`}><div className="record-symbol"><Record size={25} weight={recording ? 'fill' : 'regular'} /></div><div className="record-copy"><h2>{t("Непрерывная запись ")}{recording && <span className="record-time">{duration(stats.recordSeconds)}</span>}</h2><p>{t("От первой секунды до финального кадра.")}</p></div><button className={recording ? 'stop-btn' : 'secondary-btn'} onClick={toggleRecord} disabled={!!busy||savePending>0}>{recording ? <Stop size={16} weight="fill" /> : <Record size={16} />} {busy === 'start' ? t("Подключение…") : recording ? t("Завершить") : t("Начать запись")}</button></section>
     </div><aside className="capture-inspector"><section className="inspector-section"><div className="section-line"><h2>{t("Параметры записи")}</h2><SlidersHorizontal size={18} /></div><Select label={t("Разрешение")} value={[1080, 1440, 2160].includes(cfg.resolution) && cfg.width === Math.round(cfg.resolution * 16 / 9 / 2) * 2 ? cfg.resolution : 'custom'} onChange={v => v !== 'custom' && configure({
                    resolution: +v,
                    width: Math.round(+v * 16 / 9 / 2) * 2
                  })} disabled={locked}><option value={1080}>1920 × 1080 · Full HD</option><option value={1440}>2560 × 1440 · 2K</option><option value={2160}>3840 × 2160 · 4K</option><option value="custom">{t("Своё разрешение")}</option></Select><Select label={t('Формат файла')} value={cfg.outputFormat||'mp4'} onChange={outputFormat=>configure({outputFormat,codec:outputFormat==='webm'&&cfg.codec==='h264'||outputFormat==='mp4'&&cfg.codec==='vp8'?'auto':cfg.codec})} disabled={locked}><option value="mp4">MP4 · {t('Быстрый повтор')}</option><option value="mkv">MKV</option><option value="webm">WebM</option></Select><p className="format-hint">{cfg.outputFormat==='mp4'||!cfg.outputFormat?t('MP4 сохраняет повтор без повторного кодирования видео.'):t('Точная обрезка MKV/WebM может занять больше времени. Для быстрого повтора выбери MP4.')}</p><details className="advanced-quality"><summary>{t("Расширенные параметры")}</summary><div className="number-grid"><NumberField label={t("Ширина")} value={cfg.width || 1920} min={64} max={7680} step={2} disabled={locked} onChange={width => configure({
                      width
                    })} /><NumberField label={t("Высота")} value={cfg.resolution} min={64} max={4320} step={2} disabled={locked} onChange={resolution => configure({
                      resolution,
                      width: cfg.width
                    })} /></div><NumberField label={t("Частота кадров, FPS")} value={cfg.fps} min={1} max={240} disabled={locked} onChange={fps => configure({
                    fps
                  })} /><Select label={t("Кодек")} value={cfg.codec} onChange={v => configure({
                    codec: v
                  })} disabled={locked}><option value="auto">{t("Автоматически")}</option><option value="h264" disabled={cfg.outputFormat==='webm'}>H.264</option><option value="vp9">VP9</option><option value="vp8" disabled={!cfg.outputFormat||cfg.outputFormat==='mp4'}>VP8</option></Select><label className="range-field"><span>{t("Битрейт")}<strong>{cfg.bitrate}<small>{t(" Мбит/с")}</small></strong></span><input type="range" min="5" max="150" step="5" value={cfg.bitrate} disabled={locked} onChange={e => configure({
                      bitrate: +e.target.value
                    })} /><span className="range-scale"><span>5</span><span>{t("150 Мбит/с")}</span></span></label></details><div className="info-note"><Info size={15} /><span>{actual ? f("Источник: {0} × {1}, {2} FPS. {3}", actual.width, actual.height, Math.round(actual.frameRate || 0), actual.backend==='desktop-duplication'?'Windows · NVENC':actual.mime?.includes('mp4') ? 'H.264' : 'WebM') : t("Размер и FPS ограничены источником. Фактические параметры появятся после старта.")}</span></div></section><section className="inspector-section audio-summary"><div className="section-line"><h2>{t("Аудио")}</h2><button className="text-btn" onClick={() => navigate('audio')} aria-label={t("Настроить звук")}><ArrowUpRight size={18} /></button></div>{cfg.audio.slice(0, 3).map(a => <div className="audio-mini" key={a.id}>{a.id === 'mic' ? <Microphone size={17} /> : <SpeakerHigh size={17} />}<span>{t(a.label)}</span><span className={a.enabled ? 'audio-state' : 'muted'}>{a.enabled ? f("Трек {0}", a.track) : t("Выкл.")}</span></div>)}<div className="audio-track-count">{trackCount} {trackCount === 1 ? t("дорожка") : t("дорожки")} · {(cfg.outputFormat||'mp4').toUpperCase()} / Opus</div></section><section className="save-location"><FolderOpen size={22} /><div><h3>{t("Сохраняется локально")}</h3><button onClick={() => navigate('settings')}>{cfg.outputDir ? cfg.outputDir.split(/[\\/]/).slice(-2).join(' / ') : t("Выбрать папку")} <CaretRight size={12} /></button></div></section></aside></div>
     <section className="recent-section"><div className="section-line"><h2>{t("Последние моменты ")}<span className="inline-count">{library.length}</span></h2><button className="text-btn" onClick={() => navigate('library')}>{t("Вся библиотека")}<ArrowRight size={16} /></button></div>{library.length ? <div className="recent-list">{library.slice(0, 3).map(c => <ClipRow key={c.id || c.path} clip={c} onEdit={() => openEditor(c)} onReveal={() => api.reveal(c.id || c.name)} />)}</div> : <div className="empty-recent"><Images size={28} weight="light" /><p>{t("Здесь будет твой первый момент.")}<span>{t("Включи повтор, сыграй и нажми ")}<strong>{cfg.shortcuts.replay.replaceAll('+', ' + ')}</strong>.</span></p><button className="text-btn" onClick={() => setHelp(true)}>{t("Как это работает")}<ArrowUpRight size={16} /></button></div>}</section>
    </>}
    {page === 'audio' && <AudioPage cfg={cfg} configure={configure} locked={locked} notice={notice} />}
    {page === 'hotkeys' && <HotkeysPage statuses={shortcutStates} cfg={cfg} configure={configure} notice={notice} />}
    {page === 'settings' && <SettingsPage cfg={cfg} configure={configure} locked={locked} notice={notice} />}
    {page === 'library' && <LibraryPage library={library} setLibrary={setLibrary} notice={notice} onStart={() => navigate('capture')} onEdit={openEditor} />}
   </>}</main>
   <footer className="statusbar"><span><span className={`tiny-dot ${active ? 'on' : ''}`} />{active ? recording ? t("Запись и повтор активны") : t("Повтор активен") : t("Захват выключен")}</span><div>{native && <><span>CPU {Math.round(stats.cpu || 0)}%</span><span>RAM {Math.round(stats.memoryMB || 0)}{t(" МБ")}</span><span>{stats.freeGB != null ? f("{0} ГБ свободно", stats.freeGB.toFixed(1)) : t("Локальное хранилище")}</span></>}<span className="statusbar-brand">{t("ТВОИ МОМЕНТЫ. ТВОИ ПРАВИЛА.")}</span></div></footer>
  </div>
  {supportOpen && <SupportDialog onDismiss={()=>{setSupportOpen(false);configure({supportPromptDismissed:true});}}/>}
  {leaveTarget && <ConfirmDialog title={t('Закрыть просмотр клипа?')} cancelLabel={t('Остаться')} confirmLabel={t('Перейти')} onCancel={()=>setLeaveTarget(null)} onConfirm={leaveEditor}>{f('Перейти в раздел «{0}»? Настройки обрезки и экспорта будут сброшены. Сохранённый клип останется в библиотеке.',{capture:t('Запись'),library:t('Библиотека'),audio:t('Звук'),hotkeys:t('Бинды'),settings:t('Настройки')}[leaveTarget])}</ConfirmDialog>}
  {picker && <SourcePicker cfg={cfg} onClose={() => setPicker(false)} onSelect={async s => {
      await configure({
        sourceId: s.id,
        sourceName: s.name,
        sourceDisplayId:s.displayId,
        sourceType: s.type
      });
      setSource(s);
      setPicker(false);
    }} />}
  {toast && <div className="toast" role="status"><CheckCircle size={25} /><div><strong>{toast.title}</strong><p>{toast.detail}</p></div><IconButton label={t("Скрыть уведомление")} onClick={() => setToast(null)}><X size={16} /></IconButton></div>}
  {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><div className="section-line"><h2 id="help-title">{t("Момент уже произошёл.")}<br />{t("Но ты ещё можешь его сохранить.")}</h2><IconButton label={t("Закрыть")} onClick={() => setHelp(false)}><X size={20} /></IconButton></div><div className="help-steps"><div><Monitor size={23} /><h3>{t("Выбери источник")}</h3><p>{t("Экран для всего рабочего стола или отдельное окно игры. Для эксклюзивного полного экрана используй оконный режим без рамок.")}</p></div><div><Rewind size={23} /><h3>{t("Включи повтор")}</h3><p>{t("REWIND хранит последние ")}{cfg.replaySeconds}{t(" секунд. Старые фрагменты удаляются каждую секунду, остаётся только выбранная длина.")}</p></div><div><FloppyDisk size={23} /><h3>{t("Сохрани по бинду")}</h3><p><Keycap value={cfg.shortcuts.replay} />{t(" сохранит доступную часть буфера в MKV. Старт привязан к ключевому кадру и может отличаться примерно на 2 секунды.")}</p></div></div><div className="info-note"><Info size={18} /><span>{t("Звук компьютера включает все приложения. Для разделения игры и чата выбери виртуальные устройства Sonar. Стандартный захват окон не использует внедрение в игры.")}</span></div><button className="primary-btn" onClick={() => setHelp(false)}>{t("Понятно")}<ArrowRight size={17} /></button></section></div>}
 </div>;
}
function SourcePicker({
  cfg,
  onSelect,
  onClose
}) {
  const [type, setType] = useState(cfg.sourceType),
    [items, setItems] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api.sources(type).then(s => {
      if (!cancelled) setItems(s);
    }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);
  return <div className="modal-backdrop" onClick={onClose}><section className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title" onClick={e => e.stopPropagation()}><div className="section-line"><h2 id="source-title">{t("Выбери источник")}</h2><IconButton label={t("Закрыть выбор источника")} onClick={onClose}><X size={20} /></IconButton></div><p className="muted">{t("Захват начнётся только после включения записи или повтора.")}</p><div className="source-tabs"><button className={type === 'screen' ? 'selected' : ''} onClick={() => setType('screen')}><Monitor size={19} />{t("Весь экран")}</button><button className={type === 'window' ? 'selected' : ''} onClick={() => setType('window')}><GameController size={20} />{t("Окно игры")}</button></div>{!native ? <div className="empty-state"><DesktopTower size={42} weight="light" /><h3>{t("Источники доступны в приложении")}</h3><p>{t("Запусти REWIND.exe, чтобы выбрать экран или игру.")}</p></div> : loading ? <p className="loading">{t("Ищем доступные источники…")}</p> : error ? <div className="error-banner">{error}</div> : <div className="source-grid">{items.map(s => <button key={s.id} className="source-card" onClick={() => onSelect({
          ...s,
          type
        })}><img src={s.thumbnail} alt="" /><span>{type === 'screen' ? <Monitor size={18} /> : <GameController size={18} />}<strong>{s.name}</strong>{cfg.sourceId === s.id && <Check size={18} />}</span></button>)}{!items.length && <p className="muted">{t("Нет доступных окон. Открой игру в оконном режиме.")}</p>}</div>}<div className="info-note"><Info size={16} /><span>{t("Захват окна ограничивает изображение. Системный звук настраивается отдельно и включает все приложения.")}</span></div></section></div>;
}
createRoot(document.getElementById('root')).render(<App />);

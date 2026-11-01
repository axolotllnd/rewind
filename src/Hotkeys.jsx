import React,{useEffect,useState,useRef} from 'react';
import {Keyboard,Rewind,Record,Pause,ArrowCounterClockwise} from '@phosphor-icons/react';
import {ConfirmDialog} from './ui';
import {t,f} from './i18n';
import {keyboardAccelerator} from './key-binding.mjs';
const api=window.rewind;
export default function HotkeysPage({statuses=[],cfg,configure,notice}){
 const [listening,setListening]=useState(null),[conflict,setConflict]=useState(null);
 const keyButtons=useRef({});
 const entries=[['replay','Сохранить повтор','Последние секунды из буфера',Rewind],['record','Начать / завершить запись','Управление непрерывной записью',Record],['toggle','Включить / выключить повтор','Управление фоновым захватом',Pause]];
 useEffect(()=>{const stop=()=>{setListening(null);api?.shortcutEditing?.(false);};window.addEventListener('blur',stop);return()=>{window.removeEventListener('blur',stop);api?.shortcutEditing?.(false);};},[]);
 async function listen(key){keyButtons.current[key]?.focus();await api?.shortcutEditing?.(true);setListening(key);}
 async function assign(action,accelerator){
  try{const result=api?.assignShortcut?await api.assignShortcut(action,accelerator):{config:{shortcuts:{...cfg.shortcuts,[action]:accelerator}}};
   if(result.conflict){setConflict({action,accelerator,owner:result.conflict});return;}
   setConflict(null);await configure({shortcuts:result.config.shortcuts});
  }catch(error){notice(t('Не удалось изменить сочетание'),error.message);}finally{setListening(null);api?.shortcutEditing?.(false);}
 }
 function bind(e,action){e.preventDefault();e.stopPropagation();if(e.key==='Escape'){setListening(null);api?.shortcutEditing?.(false);return;}if(['Alt','Control','Shift','Meta'].includes(e.key))return;
  const accelerator=keyboardAccelerator(e);if(!accelerator){notice(t('Добавь клавишу-модификатор'),t('Используй Alt, Ctrl или Shift вместе с основной клавишей.'));return;}assign(action,accelerator);
 }
 return <div className="settings-content"><div className="wide-intro"><Keyboard size={36} weight="light"/><div><h2>{t('Не выходи из игры.')}</h2><p>{t('Глобальные сочетания работают, даже когда окно REWIND свёрнуто.')}</p></div></div><div className="hotkey-list">{entries.map(([id,label,detail,Icon])=><section className="hotkey-row" key={id}><Icon size={25}/><div><h3>{t(label)}</h3><p>{t(detail)}</p>{statuses.length>0&&<small className="bind-status">{!cfg.shortcuts[id]?t('Не назначен'):statuses.find(s=>s.action===id)?.registered?t('Бинд зарегистрирован'):t('Бинд не зарегистрирован')}</small>}</div><button ref={el=>keyButtons.current[id]=el} className={`hotkey-input ${listening===id?'listening':''}`} aria-label={f('Изменить сочетание: {0}',t(label))} onClick={()=>listen(id)} onBlur={()=>{setListening(null);api?.shortcutEditing?.(false);}} onKeyDown={e=>listening===id&&bind(e,id)}>{listening===id?t('Нажми сочетание…'):cfg.shortcuts[id]||t('Назначить')}</button></section>)}</div><div className="info-note"><Keyboard size={18}/><span>{t('Внутри REWIND сочетания не повторяются. Бинды других программ не мешают назначению; эти программы также могут реагировать на нажатие.')}</span></div><button className="text-btn" onClick={()=>configure({shortcuts:{replay:'Alt+F10',record:'Alt+F9',toggle:'Alt+Shift+F10'}})}><ArrowCounterClockwise size={17}/>{t('Вернуть стандартные бинды')}</button>{conflict&&<ConfirmDialog title={t('Сочетание уже занято в REWIND')} cancelLabel={t('Отмена')} confirmLabel={t('Выбрать другое')} onCancel={()=>setConflict(null)} onConfirm={()=>{setConflict(null);listen(conflict.action);}}>{f('{0} уже назначено действию «{1}». Текущее назначение сохранено. Выбери другое сочетание.',conflict.accelerator,t(entries.find(e=>e[0]===conflict.owner)?.[1]||''))}</ConfirmDialog>}</div>;
}

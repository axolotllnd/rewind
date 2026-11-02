import React,{useEffect,useState} from 'react';
import './maintenance.css';
import {ArrowClockwise,DownloadSimple,CheckCircle,Trash,ArrowSquareOut} from '@phosphor-icons/react';
import {ConfirmDialog,Toggle} from './ui';
import {t,f} from './i18n';
const api=window.rewind;
const errors={
 'network':'Не удалось связаться с GitHub. Проверь интернет и повтори попытку.',
 'rate-limit':'GitHub временно ограничил запросы. Попробуй проверить обновления позже.',
 'invalid-release':'В релизе нет подходящего проверяемого установщика. Открой страницу релиза.',
 'download':'Загрузка прервалась. Попробуй скачать обновление ещё раз.',
 'checksum':'Проверка файла не пройдена. Скачай обновление заново.',
 'not-installed':'Доступно для версии, установленной через установщик Windows.',
 'no-update':'Сначала проверь и скачай обновление.',
 'no-uninstaller':'Деинсталлятор не найден. Используй раздел «Установленные приложения» Windows.',
 'media-busy':'Дождись завершения экспорта или запуска захвата и повтори попытку.',
 'save-failed':'Не удалось сохранить клип. Обновление или удаление отменено; захват и буфер сохранены. Повтори сохранение клипа.',
 'busy':'Дождись завершения текущего действия.',
 'launch':'Не удалось открыть установщик. Повтори попытку или открой страницу релиза.'
};
function message(error){const code=String(error).trim().split(': ').at(-1);return t(errors[code]||'Не удалось выполнить действие. Повтори попытку.');}
const megabytes=value=>(value/1024**2).toFixed(1);
export default function AppMaintenance({cfg,configure}){
 const [state,setState]=useState({phase:'idle',currentVersion:'0.2.11',installed:false,canUninstall:false}),[working,setWorking]=useState(false),[confirmation,setConfirmation]=useState(null),[failure,setFailure]=useState('');
 useEffect(()=>{let alive=true;const accept=next=>{if(alive)setState(previous=>({...previous,...next}));};const unsubscribe=api?.onMaintenanceState?.(accept);api?.maintenanceState?.().then(accept).catch(()=>{if(alive)setFailure('network');});return()=>{alive=false;unsubscribe?.();};},[]);
 const busy=working||['checking','downloading','installing','removing'].includes(state.phase);
 async function act(action){setWorking(true);setFailure('');try{const result=await api[action]();if(result)setState(previous=>({...previous,...result}));}catch(error){setFailure(error.message);}finally{setWorking(false);}}
 function confirm(){const action=confirmation==='update'?'installUpdate':'uninstallApp';setConfirmation(null);act(action);}
 const status={idle:t('Проверь, есть ли новая версия.'),checking:t('Проверяем обновления…'),current:t('Установлена последняя версия.'),available:f('Доступна версия {0}',state.version),downloading:t('Загрузка обновления…'),ready:f('Версия {0} готова к установке',state.version),installing:t('Сохраняем запись и запускаем обновление…'),removing:t('Сохраняем запись и открываем удаление…'),error:t('Не удалось проверить обновления.')}[state.phase];
 return <>
  <section className="settings-section maintenance-section">
   <div className="maintenance-heading"><h2>{t('Обновления')}</h2><span className="maintenance-version">REWIND {state.currentVersion}</span></div>
   <div className="setting-row maintenance-status">
    <div><h3 role="status" aria-live="polite">{state.phase==='current'||state.phase==='ready'?<CheckCircle size={17}/>:null}{status}</h3><p>{t('Официальные релизы из GitHub. Файл проверяется перед установкой.')}</p></div>
    <button className="secondary-btn" disabled={!api||busy} onClick={()=>act('checkUpdate')}><ArrowClockwise size={17} className={state.phase==='checking'?'maintenance-spin':''}/>{t('Проверить обновления')}</button>
   </div>
   {state.phase==='downloading'&&<div className="update-download"><progress aria-label={t('Загрузка обновления')} max="1" value={state.progress||0}/><div><span>{megabytes(state.received||0)} / {megabytes(state.total||0)} {t('МБ')} · {Math.floor((state.progress||0)*100)}%</span><button className="text-btn" onClick={()=>act('cancelUpdate')}>{t('Отменить загрузку')}</button></div></div>}
   {(failure||state.error)&&<p className="maintenance-error" role="alert">{message(failure||state.error)}</p>}
   {state.phase==='available'&&state.installed&&<div className="update-actions"><button className="primary-btn" disabled={working} onClick={()=>act('downloadUpdate')}><DownloadSimple size={18}/>{t('Скачать обновление')}<span>{megabytes(state.total)} {t('МБ')}</span></button><span>{t('Запись продолжится во время загрузки.')}</span></div>}
   {state.phase==='ready'&&state.installed&&<div className="update-actions"><button className="primary-btn" disabled={working} onClick={()=>setConfirmation('update')}><ArrowClockwise size={18}/>{t('Установить и перезапустить')}</button><span>{t('Файл проверен. Клипы и настройки сохранятся.')}</span></div>}
   <div className="setting-row"><div><h3>{t('Проверять обновления при запуске')}</h3><p>{t('Только проверка. Скачивание и установка — по твоей команде.')}</p></div><Toggle label={t('Проверять обновления при запуске')} value={cfg.checkUpdatesOnStart!==false} disabled={['installing','removing'].includes(state.phase)} onChange={value=>configure({checkUpdatesOnStart:value})}/></div>
   <button className="text-btn" disabled={!api||['installing','removing'].includes(state.phase)} onClick={()=>act('releasePage')}>{t('Все версии на GitHub')}<ArrowSquareOut size={15}/></button>
   {!state.installed&&<p className="maintenance-note">{t('Доступно для версии, установленной через установщик Windows.')}</p>}
  </section>
  <section className="settings-section maintenance-section"><h2>{t('Удаление приложения')}</h2><div className="setting-row"><div><h3>{t('Удалить REWIND с компьютера')}</h3><p>{t('Клипы, библиотека и настройки останутся на месте.')}</p></div><button className="secondary-btn" disabled={!state.canUninstall||busy} onClick={()=>setConfirmation('uninstall')}><Trash size={17}/>{t('Удалить REWIND')}</button></div>{!state.canUninstall&&state.installed&&<p className="maintenance-note">{t('Деинсталлятор не найден. Используй раздел «Установленные приложения» Windows.')}</p>}</section>
  {confirmation&&<ConfirmDialog title={confirmation==='update'?t('Обновить и перезапустить REWIND?'):t('Удалить REWIND?')} cancelLabel={t('Отмена')} confirmLabel={confirmation==='update'?t('Обновить и перезапустить'):t('Открыть удаление')} onCancel={()=>setConfirmation(null)} onConfirm={confirm}>{confirmation==='update'?t('Текущая непрерывная запись будет сохранена. Несохранённый буфер очистится. Приложение обновится и откроется снова; клипы и настройки сохранятся.'):t('Текущая непрерывная запись будет сохранена, затем REWIND закроется и откроется мастер удаления Windows. Несохранённый буфер очистится. Клипы и настройки не удаляются.')}</ConfirmDialog>}
 </>;
}

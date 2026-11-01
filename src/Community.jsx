import React, {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,GithubLogo,TelegramLogo,Rewind,X} from '@phosphor-icons/react';
import {t} from './i18n';

const links={telegram:'https://t.me/axolotllnd',github:'https://github.com/axolotllnd'};
export function CommunityLinks(){
 const [error,setError]=useState('');
 async function open(event,id){if(!window.rewind)return;event.preventDefault();try{await window.rewind.openLink(id);setError('');}catch{setError(t('Не удалось открыть браузер. Скопируй адрес ссылки.'));}}
 return <><div className="community-links">{[['telegram',TelegramLogo,'Telegram','Новости и обновления'],['github',GithubLogo,'GitHub','Профиль разработчика']].map(([id,Icon,name,detail])=><a key={id} className="community-link" href={links[id]} target="_blank" rel="noopener noreferrer" onClick={e=>open(e,id)}><Icon size={26} weight="light"/><span><strong>{name}</strong><small>{t(detail)}</small><span className="community-address">{id==='telegram'?'t.me/axolotllnd':'github.com/axolotllnd'}</span></span><ArrowUpRight size={18}/></a>)}</div>{error&&<p role="alert" className="community-error">{error}</p>}</>;
}
export function SupportDialog({onDismiss}){
 const dialog=useRef();
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="modal support-dialog" aria-labelledby="support-title" aria-describedby="support-description" onCancel={e=>{e.preventDefault();onDismiss();}}><div className="support-top"><span className="support-wordmark"><Rewind size={23} weight="fill"/>rewind.</span><button className="icon-btn" autoFocus aria-label={t('Закрыть')} onClick={onDismiss}><X size={20}/></button></div><h2 id="support-title">{t('Сохраняй моменты.')}<br/>{t('Следи за продолжением.')}</h2><p id="support-description">{t('Подпишись на Telegram и профиль на GitHub, чтобы следить за развитием REWIND и новыми версиями.')}</p><CommunityLinks/><div className="support-bottom"><p>{t('По желанию. REWIND уже готов к работе.')}</p><button className="primary-btn" onClick={onDismiss}>{t('Начать пользоваться')}<ArrowUpRight size={17}/></button></div></dialog>;
}

import translations from './translations.json';
let locale='ru';
export function setLocale(value){locale=value==='en'?'en':'ru';document.documentElement.lang=locale;document.title=locale==='en'?'REWIND — record & replay':'REWIND — запись и мгновенный повтор';}
export function t(value){return locale==='en'?(translations[value]||value):value;}
export function f(value,...args){return t(value).replace(/\{(\d+)\}/g,(_,n)=>String(args[+n]));}

import React, {useEffect,useRef} from 'react';
export function ConfirmDialog({title,children,cancelLabel,confirmLabel,onCancel,onConfirm}){
 const dialog=useRef();
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="modal confirm-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={e=>{e.preventDefault();onCancel();}}><h2 id="confirm-title">{title}</h2><p id="confirm-description">{children}</p><div className="confirm-actions"><button className="secondary-btn" autoFocus onClick={onCancel}>{cancelLabel}</button><button className="primary-btn" onClick={onConfirm}>{confirmLabel}</button></div></dialog>;
}
export function IconButton({label,children,...props}){return <button className="icon-btn" title={label} aria-label={label} {...props}>{children}</button>;}
export function Toggle({value,onChange,label,disabled}){return <button type="button" className={`toggle ${value?'on':''}`} role="switch" aria-checked={value} aria-label={label} onClick={()=>onChange(!value)} disabled={disabled}><span/></button>;}
export function Select({label,value,onChange,children,disabled}){return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>{children}</select></label>;}
export function NumberField({label,value,onChange,min,max,step=1,disabled}){return <label className="field number-field"><span>{label}</span><input type="number" min={min} max={max} step={step} defaultValue={value} key={value} disabled={disabled} onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)onChange(n);else e.target.value=value;}} onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}/></label>;}
export const duration=n=>{n=Math.max(0,Math.floor(n||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};

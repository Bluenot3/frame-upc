import React,{useEffect,useRef,useState} from 'react';
import {X,Copy,Check,ArrowRight,AlertCircle} from 'lucide-react';
import {isCodeLength,normalizeCode,validCheckDigit} from './upc.mjs';

export function Dialog({title,children,onClose,className=''}) {
  const ref=useRef();
  useEffect(()=>{const el=ref.current;el.showModal();return()=>el.close();},[]);
  return <dialog ref={ref} className={className} onCancel={e=>{e.preventDefault();onClose();}} aria-label={title}><div className="dialog-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X/></button></div>{children}</dialog>;
}

export function ReviewDialog({candidate,onConfirm,onClose}){
  const [code,setCode]=useState(candidate.code),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
  const normalized=normalizeCode(code),valid=validCheckDigit(normalized);
  function submit(e){e.preventDefault();if(!isCodeLength(normalized)){setError('A UPC/EAN must have 12, 13, or 14 digits.');return;}if(!confirmed){setError('Compare the number with the paper and confirm below.');return;}onConfirm(normalized);}
  return <Dialog title="Check this UPC" onClose={onClose}><p className="dialog-intro">Compare every digit with the printed UPC before adding it.</p><p className="notice warning"><AlertCircle size={19}/>{!candidate.valid?'The check digit did not match. A number may have been misread.':candidate.corrected?'A letter looked like a digit. Please confirm the number.':'Multiple codes were found. Confirm this is the frame UPC.'}</p><form onSubmit={submit}><label htmlFor="review-upc">Frame UPC</label><input className="large-code" id="review-upc" inputMode="numeric" autoComplete="off" value={code} onChange={e=>{setCode(e.target.value);setConfirmed(false);}}/><p className="hint">{valid?'Check digit matches. Still compare with the paper.':'If the printed number really has this check digit, you can confirm it manually.'}</p><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I checked every digit against the paper.</label>{error&&<p className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button" type="button" onClick={onClose}>Skip this code</button><button className="button primary" type="submit">Confirm & add</button></div></form></Dialog>;
}

export function TransferDialog({entries,onDone,onReset,copy,onClose}){
  const pending=entries.filter(e=>!e.done),current=pending[0],next=pending[1],completed=entries.length-pending.length;
  const [copied,setCopied]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function copyCurrent(){setError('');setBusy(true);try{await copy(current.code);setCopied(current.code);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function done(){setError('');setBusy(true);try{if(next)await copy(next.code);onDone(current.code);setCopied(next?.code||'');}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title="Transfer to Encompass" className="transfer-dialog" onClose={onClose}>
    <p className="dialog-intro">Keep Encompass beside this window. Paste into its UPC field, complete the add there, then return for the next code.</p>
    <div className="transfer-progress"><span>{completed} of {entries.length} marked done</span><progress value={completed} max={entries.length||1}/></div>
    {current?<><p className="transfer-label">Next frame UPC</p><div className="transfer-code">{current.code}</div><p className="hint centered">{copied===current.code?'Copied. Paste into Encompass with Ctrl + V.':'Copy this UPC to begin.'}</p><div className="transfer-actions"><button className="button" disabled={busy} onClick={copyCurrent}><Copy/>{copied===current.code?'Copy again':'Copy UPC'}</button><button className="button primary" disabled={busy||copied!==current.code} onClick={done}>{next?'Done & copy next':'Mark last one done'}<ArrowRight/></button></div><p className="hint">“Done” tracks your progress here. It does not verify or submit anything in Encompass.</p></>:<div className="transfer-complete"><Check size={44}/><h3>{entries.length?'All marked done':'Your list is empty'}</h3><p>{entries.length?'Your transfer progress is saved on this browser.':'Scan a frame UPC to get started.'}</p>{entries.length>0&&<button className="button" onClick={onReset}>Reset transfer progress</button>}</div>}
    {error&&<p className="notice error" role="alert">{error}</p>}
  </Dialog>;
}

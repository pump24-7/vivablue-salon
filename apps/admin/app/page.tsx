'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api,Field,TeamPanel,RecordsPanel,AuditPanel} from '../src/management-panels';
import {VIVA_BLUE_LOGO_URL} from '../src/brand';
type Tab='overview'|'appointments'|'team'|'catalog'|'lookbook'|'modifiers'|'inventory'|'events'|'finance'|'settings'|'audit';
type Appt={quoted_price_cents:number|null,end_at:string,customer_note:string|null,selected_modifiers:{label_en:string,additional_minutes:number}[],consultation_ack:boolean,policy_ack_at:string|null,policy_effective_at:string|null,requires_consultation:boolean,id:string,start_at:string,status:string,name_en:string,stylist_name:string,customer_name:string|null};
type Service={id:string,name_en:string,name_es:string,is_bookable:boolean,requires_consultation:boolean,duration_minutes:number|null,starting_price_cents:number|null};
type Stylist={id:string,display_name:string,service_ids:string[]};
type PeakRule={id:string,weekday:number,start_local:string,end_local:string,surcharge_bps:number,is_active:boolean};
const tabs:readonly {id:Tab,label:string}[]=[{id:'overview',label:'✿ Overview'},{id:'appointments',label:'▦ Appointments'},
 {id:'team',label:'♧ Stylists & shifts'},{id:'catalog',label:'✂ Services'},
 {id:'lookbook',label:'▧ Style lookbook'},{id:'modifiers',label:'◇ Style modifiers'},
 {id:'inventory',label:'◈ Retail inventory'},{id:'events',label:'☆ Events'},
{id:'finance',label:'▤ Finance review'},
 {id:'settings',label:'⚙ Policies & calendar'},{id:'audit',label:'◷ Audit & access'}];
const money=(v:number|null|undefined)=>v==null?'Consultation':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
const date=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});
export default function Studio(){
 const [tab,setTab]=useState<Tab>('overview'),[message,setMessage]=useState(''),[signed,setSigned]=useState<boolean|null>(null),[busy,setBusy]=useState(false);
 const [overview,setOverview]=useState<any>({counts:[],upcoming:[],alerts:{}}),[appointments,setAppointments]=useState<Appt[]>([]);
 const [services,setServices]=useState<Service[]>([]),[stylists,setStylists]=useState<Stylist[]>([]);
 const [finance,setFinance]=useState<any>({webhooks:[]}),[closures,setClosures]=useState<any[]>([]),[peakRules,setPeakRules]=useState<PeakRule[]>([]);
 const [revision,setRevision]=useState(0),[role,setRole]=useState('manager');
 const working=useRef(false);
 const [closureFrom,setClosureFrom]=useState(''),[closureTo,setClosureTo]=useState(''),[closureReason,setClosureReason]=useState(''),[closureId,setClosureId]=useState('');
 const [peakDay,setPeakDay]=useState('6'),[peakStart,setPeakStart]=useState('10:00'),[peakEnd,setPeakEnd]=useState('14:00'),[peakPct,setPeakPct]=useState('0');
 const [cancelEn,setCancelEn]=useState(''),[cancelEs,setCancelEs]=useState(''),[consentEn,setConsentEn]=useState(''),[consentEs,setConsentEs]=useState(''),[privacyUrl,setPrivacyUrl]=useState('');
 const refresh=useCallback(async()=>{
  setBusy(true);try{
   const workspace=await api('admin/workspace');
   setOverview(workspace.overview);setRole(workspace.role);setAppointments(workspace.appointments);setServices(workspace.services);setStylists(workspace.stylists);setRevision(n=>n+1);
   setSigned(true);setMessage('Studio synced successfully.');
  }catch(e){if(String(e).includes('SIGN_IN_REQUIRED')||String(e).includes('permissions'))setSigned(false);setMessage(String(e))}finally{setBusy(false)}
 },[]);
 useEffect(()=>{fetch('/api/auth/status').then(x=>x.json()).then(x=>{setSigned(x.signedIn);if(x.signedIn)void refresh()}).catch(()=>setSigned(false))},[refresh]);
 useEffect(()=>{let current=true;if(signed&&tab==='settings')Promise.all([api('admin/closures'),api('admin/peak-rules'),api('admin/policies')]).then(([c,k,p])=>{if(!current)return;setClosures(c.closures);setPeakRules(k.rules);if(p.policies){setCancelEn(p.policies.cancellation_en);setCancelEs(p.policies.cancellation_es);setConsentEn(p.policies.service_consent_en);setConsentEs(p.policies.service_consent_es);setPrivacyUrl(p.policies.privacy_url??'')}}).catch(e=>{if(current)setMessage(String(e))});
  if(signed&&tab==='finance')api('admin/finance').then(f=>{if(current)setFinance(f)}).catch(e=>{if(current)setMessage(String(e))});return()=>{current=false}},[signed,tab,revision]);
 async function execute(task:()=>Promise<unknown>,reload=true):Promise<boolean>{
  if(working.current)return false;working.current=true;setBusy(true);setMessage('');
  try{await task();if(reload)await refresh();else setMessage('Request completed.');return true}
  catch(e){if(String(e).includes('SIGN_IN_REQUIRED'))setSigned(false);setMessage(String(e));return false}
  finally{working.current=false;setBusy(false)}
 }
 async function signOut(){if(working.current)return;working.current=true;setBusy(true);try{
  const r=await fetch('/api/auth/logout',{method:'POST',headers:{'x-vivablue-request':'admin'}});if(!r.ok)throw Error('Sign out failed');
  setSigned(false);setOverview({counts:[],upcoming:[],alerts:{}});setAppointments([]);setServices([]);setStylists([]);setFinance({webhooks:[]});setClosures([]);setPeakRules([]);setMessage('Signed out.');
 }catch(e){setMessage(String(e))}finally{working.current=false;setBusy(false)}}
 const panelProps={run:execute,busy,revision,services,stylists};
 async function updateBooking(id:string,status:'confirmed'|'declined'|'cancelled'|'completed'){
  if(['declined','completed'].includes(status)&&!window.confirm('Mark this appointment '+status+'?'))return;
  await execute(()=>api('admin/bookings/'+id+'/status','POST',{status}));
 }
 if(signed===null)return <main className="login"><h2>Viva Blue Studio</h2><p>Checking secure organization access…</p></main>;
 if(!signed)return <main className="login"><p className="overline">Viva Blue Salon • Team Only</p><img className="loginLogo" src={VIVA_BLUE_LOGO_URL} alt="Official Viva Blue Salon logo"/><h1 style={{font:'bold 36px Georgia,serif'}}>Welcome to the studio ✿</h1>
  <p className="note">Protected appointment, styling and financial operations. Sign in using your organization account. Your role is verified by the salon API.</p>
  <a className="primary" href="/api/auth/login" style={{display:'inline-block',textDecoration:'none',marginTop:14}}>Organization SSO sign-in</a>
  {message&&<p className="alert" role="status">{message}</p>}<p className="alert">Sign-in requires approved OIDC configuration; no pasted manager tokens or demo credentials.</p></main>;
 const counts=Object.fromEntries((overview.counts??[]).map((r:any)=>[r.status,r.total]));
 return <div className="shell">
  <aside className="side"><p className="overline">Team workspace</p><img className="brandLogo" src={VIVA_BLUE_LOGO_URL} alt="Official Viva Blue Salon logo"/><small>SALON STUDIO · v0.3</small>
   <div style={{marginTop:24}}>{tabs.map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
   <button disabled={busy} onClick={()=>void signOut()}>↗ Sign out</button>
  </aside>
  <main className="main"><div className="top"><div><p className="overline">Richmond, Virginia · America/New_York</p><h2>{tabs.find(t=>t.id===tab)?.label.replace(/^[^A-Za-z]+/,'')}</h2><p className="note">Carefully reviewed services. Beautiful client experience. No invented prices or availability.</p></div><div className="actions"><span className="pill">● Authenticated team</span><button className="secondary" disabled={busy} onClick={()=>void refresh()}>↻ Refresh</button></div></div>
   {message?<p className={message.includes('Error')?'alert':'success'} role="status">{message}</p>:null}
   {tab==='overview'?<><div className="grid">{[['Requested',counts.requested??0],['Confirmed',counts.confirmed??0],['Completed',counts.completed??0],['Media reviews',overview.alerts?.media_pending??0],['Finance alerts',overview.alerts?.finance_pending??0]].map(([n,v])=><div className="metric" key={n}><span className="overline">{n}</span><strong>{v}</strong></div>)}</div>
    <div className="card"><h3>Upcoming studio appointments</h3><p className="note">Displayed in salon local time. Requests are not confirmed until approved.</p><div className="tablewrap"><table><thead><tr><th>Client</th><th>Service</th><th>Stylist</th><th>When</th><th>Status</th></tr></thead><tbody>{(overview.upcoming??[]).map((x:Appt)=><tr key={x.id}><td>{x.customer_name??'Client'}</td><td>{x.name_en}</td><td>{x.stylist_name}</td><td>{date(x.start_at)}</td><td><span className="tag">{x.status}</span></td></tr>)}</tbody></table></div></div></>:null}
   {tab==='appointments'?<div className="card"><h3>Appointment review queue</h3><p className="note">Confirm only after reviewing the appointment details and consultation requirements.</p><div className="tablewrap"><table><thead><tr><th>Date</th><th>Service</th><th>Client</th><th>Stylist</th><th>Status</th><th>Review & actions</th></tr></thead><tbody>{appointments.map(a=><tr key={a.id}><td>{date(a.start_at)}</td><td>{a.name_en}</td><td>{a.customer_name??'Client'}</td><td>{a.stylist_name}</td><td><span className="tag">{a.status}</span></td><td><details><summary>Appointment details</summary><p>Ends: {date(a.end_at)} · Estimate: {money(a.quoted_price_cents)}</p><p>Modifiers: {a.selected_modifiers.map(m=>m.label_en+' ('+m.additional_minutes+' min)').join(', ')||'None'}</p><p>Customer note: {a.customer_note||'None'}</p><p>Consultation: {a.requires_consultation?'Required':'Not required'} · Acknowledged: {a.consultation_ack?'Yes':'No'}</p><p>Policies acknowledged: {a.policy_ack_at?date(a.policy_ack_at):'Not recorded'} · Version: {a.policy_effective_at?date(a.policy_effective_at):'Not recorded'}</p></details><div className="actions">{a.status==='requested'?<><button className="secondary" disabled={busy} onClick={()=>void updateBooking(a.id,'confirmed')}>Confirm</button><button className="danger" disabled={busy} onClick={()=>void updateBooking(a.id,'declined')}>Decline</button></>:null}{['confirmed','cancel_requested'].includes(a.status)?<button className="danger" disabled={busy} onClick={()=>void updateBooking(a.id,'cancelled')}>Cancel</button>:null}{a.status==='confirmed'?<button className="secondary" disabled={busy} onClick={()=>void updateBooking(a.id,'completed')}>Complete</button>:null}</div></td></tr>)}</tbody></table></div></div>:null}
   {tab==='team'?<TeamPanel {...panelProps}/>:null}
   {(['catalog','modifiers','inventory','events','lookbook'] as const).map(kind=>tab===kind?<RecordsPanel key={kind} kind={kind} {...panelProps}/>:null)}
   {tab==='audit'?<AuditPanel run={execute} busy={busy} revision={revision} role={role}/>:null}
   {tab==='finance'?<><div className="alert">Refunds, disputes, tax and Stripe payout reconciliation need a reviewed financial workflow. Previous financial exceptions remain available for review, but the old subscription checkout is disabled.</div><section className="card"><h3>Webhook processing monitor</h3><div className="tablewrap"><table><thead><tr><th>Event type</th><th>Received</th><th>Status</th><th>Note</th></tr></thead><tbody>{(finance.webhooks??[]).map((x:any)=><tr key={x.stripe_event_id}><td>{x.event_type}</td><td>{date(x.received_at)}</td><td><span className="tag">{x.processing_status}</span></td><td>{x.note}</td></tr>)}</tbody></table></div></section></>:null}
   {tab==='settings'?<><section className="card"><h3>Salon calendar closures</h3><p className="note">Time blocks are stored as absolute times. Enter offset-aware datetimes and confirm the timezone before saving.</p><div className="form"><Field label="Closure begins (ISO offset)" value={closureFrom} onChange={setClosureFrom}/><Field label="Closure ends (ISO offset)" value={closureTo} onChange={setClosureTo}/><Field label="Closure reason" value={closureReason} onChange={setClosureReason}/></div><div className="actions"><button className="primary" disabled={busy||!closureFrom||!closureTo} onClick={()=>void execute(()=>api('admin/closures'+(closureId?'/'+closureId:''),closureId?'PATCH':'POST',{startAt:closureFrom,endAt:closureTo,reason:closureReason})).then(ok=>{if(ok){setClosureId('');setClosureFrom('');setClosureTo('');setClosureReason('')}})}>{closureId?'Save closure':'Add closure'}</button>{closureId&&<button className="secondary" onClick={()=>{setClosureId('');setClosureFrom('');setClosureTo('');setClosureReason('')}}>New closure</button>}</div>{closures.map(c=><div className="scheduleRow" key={c.id}><span>{date(c.start_at)}–{date(c.end_at)} · {c.reason}</span><button className="secondary" disabled={busy} onClick={()=>{setClosureId(c.id);setClosureFrom(c.start_at);setClosureTo(c.end_at);setClosureReason(c.reason)}}>Edit closure</button><button className="danger" disabled={busy} onClick={()=>{if(window.confirm('Remove this salon closure?'))void execute(()=>api('admin/closures/'+c.id,'DELETE'))}}>Remove closure</button></div>)}</section>
    <section className="card"><h3>Approved peak-hour pricing</h3><div className="form"><Field label="ISO weekday (1=Mon, 7=Sun)" value={peakDay} onChange={setPeakDay}/><Field label="From (HH:mm)" value={peakStart} onChange={setPeakStart}/><Field label="To (HH:mm)" value={peakEnd} onChange={setPeakEnd}/><Field label="Approved surcharge %" value={peakPct} onChange={setPeakPct}/></div><button className="secondary" disabled={busy} onClick={()=>void execute(()=>api('admin/peak-rules','POST',{weekday:Number(peakDay),startLocal:peakStart,endLocal:peakEnd,surchargeBps:Math.round(Number(peakPct)*100),activate:false}))}>Save inactive draft rule</button><p className="note">{peakRules.filter(p=>p.is_active).length} active approved rules. No placeholder premium is applied.</p><div className="tablewrap"><table><thead><tr><th>Weekday</th><th>Window</th><th>Surcharge</th><th>Status</th><th>Action</th></tr></thead><tbody>{peakRules.map(r=><tr key={r.id}><td>{r.weekday}</td><td>{r.start_local}–{r.end_local}</td><td>{r.surcharge_bps/100}%</td><td>{r.is_active?'Approved & active':'Draft'}</td><td><button className="secondary" disabled={busy} onClick={()=>void execute(()=>api('admin/peak-rules/'+r.id+'/activate','POST',{activate:!r.is_active}))}>{r.is_active?'Disable':'Approve & activate'}</button></td></tr>)}</tbody></table></div></section>
    <section className="card"><h3>Salon policy approval</h3><p className="note">Have salon counsel/management approve the English and Spanish language. Do not reuse café animal waivers.</p><div className="form"><Field label="Cancellation policy (English)" value={cancelEn} onChange={setCancelEn}/><Field label="Política de cancelación (Español)" value={cancelEs} onChange={setCancelEs}/><Field label="Service consent (English)" value={consentEn} onChange={setConsentEn}/><Field label="Consentimiento (Español)" value={consentEs} onChange={setConsentEs}/><Field label="Published privacy URL" value={privacyUrl} onChange={setPrivacyUrl}/></div><button className="primary" disabled={busy||!cancelEn||!cancelEs||!consentEn||!consentEs||!privacyUrl} onClick={()=>void execute(()=>api('admin/policies','POST',{cancellationEn:cancelEn,cancellationEs:cancelEs,serviceConsentEn:consentEn,serviceConsentEs:consentEs,privacyUrl}))}>Approve and publish salon policies</button></section></>:null}
   <div className="status">Viva Blue Studio v0.3 · Draft engineering build · Approved data only · No client email/phone displayed</div>
  </main>
 </div>;
}

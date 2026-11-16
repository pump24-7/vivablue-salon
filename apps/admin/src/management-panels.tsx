'use client';
import {useEffect,useId,useState} from 'react';

export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch('/api/bridge/'+path,{method,credentials:'same-origin',cache:'no-store',
  headers:method==='GET'?{}:{...(body===undefined?{}:{'content-type':'application/json'}),'x-vivablue-request':'admin'},body:body===undefined?undefined:JSON.stringify(body)});
 if(r.status===401)throw Error('SIGN_IN_REQUIRED');
 const data=await r.json();if(!r.ok)throw Error(data.message??data.error??'Request failed');return data;
}
export const date=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});
const price=(value:number|null)=>value===null?'Price not set':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
export function Field({label,value,onChange,type='text',placeholder=''}:{label:string,value:string,onChange:(v:string)=>void,type?:string,placeholder?:string}){
 const id=useId();return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>;
}
type Run=(task:()=>Promise<unknown>,reload?:boolean)=>Promise<boolean>;
type Props={run:Run,busy:boolean,revision:number,services:any[],stylists:any[]};
type Input={key:string,column:string,label:string,type?:'number'|'money'|'boolean'|'textarea'|'service',nullable?:boolean,initial?:string|boolean};
const f=(key:string,column:string,label:string,type?:Input['type'],nullable=false):Input=>({key,column,label,type,nullable});
const serviceFields=[f('slug','slug','Service URL name'),f('nameEn','name_en','Service name (English)'),f('nameEs','name_es','Servicio (Español)'),
 f('descriptionEn','description_en','Description (English)','textarea'),f('descriptionEs','description_es','Descripción (Español)','textarea'),
 f('durationMinutes','duration_minutes','Approved duration in minutes','number',true),f('bufferMinutes','buffer_minutes','Buffer in minutes','number'),
 f('startingPriceCents','starting_price_cents','Starting price USD (blank = consultation)','money',true),
 f('requiresConsultation','requires_consultation','Consultation required','boolean'),f('isVisible','is_visible','Visible in customer catalog','boolean'),f('isBookable','is_bookable','Approved for online requests','boolean')];
const modifierFields=[f('serviceId','service_id','Service','service'),f('labelEn','label_en','Modifier (English)'),f('labelEs','label_es','Modificador (Español)'),
 f('additionalMinutes','additional_minutes','Additional minutes','number'),f('additionalPriceCents','additional_price_cents','Added price USD','money'),f('isEnabled','is_enabled','Enabled for new requests','boolean')];
const productFields=[f('name','name','Product name'),f('description','description','Description','textarea'),f('imageUrl','image_url','Approved HTTPS product image',undefined,true),
 f('ingredientsNote','ingredients_note','Ingredients/chemical notes','textarea',true),f('allergyCaution','allergy_caution','Allergy/sensitivity caution','textarea',true),
 f('stockOnHand','stock_on_hand','Stock units','number'),f('unitPriceCents','unit_price_cents','Approved unit price USD','money',true),f('availableForSale','available_for_sale','List in salon catalog','boolean')];
const eventFields=[f('titleEn','title_en','Title (English)'),f('titleEs','title_es','Título (Español)'),f('descriptionEn','description_en','Description (English)','textarea'),f('descriptionEs','description_es','Descripción (Español)','textarea'),
 f('startsAt','starts_at','Start ISO with offset'),f('endsAt','ends_at','End ISO with offset'),f('capacity','capacity','Capacity','number'),{...f('priceCents','price_cents','Price USD (paid registration remains disabled)','money',true),initial:'0'}];
const lookFields=[f('imageUrl','image_url','Approved HTTPS image URL'),f('sourceUrl','source_url','Source HTTPS URL',undefined,true),f('captionEn','caption_en','Caption (English)'),f('captionEs','caption_es','Descripción (Español)'),f('serviceId','service_id','Related service','service',true)];
function initial(fields:Input[],row?:any){return Object.fromEntries(fields.map(x=>[x.key,row?x.type==='boolean'?Boolean(row[x.column]):row[x.column]==null?'':String(x.type==='money'?row[x.column]/100:row[x.column]):x.initial??(x.type==='boolean'?false:x.type==='number'&&!x.nullable?'0':'')]))}
function Inputs({fields,value,set,services}:{fields:Input[],value:Record<string,any>,set:(key:string,v:any)=>void,services:any[]}){
 const id=useId();return <div className="form">{fields.map(x=>x.type==='boolean'?<label className="check" key={x.key}><input type="checkbox" checked={Boolean(value[x.key])} onChange={e=>set(x.key,e.target.checked)}/>{x.label}</label>:
  <div className="field" key={x.key}><label htmlFor={id+x.key}>{x.label}</label>{x.type==='textarea'?<textarea id={id+x.key} value={value[x.key]??''} onChange={e=>set(x.key,e.target.value)}/>:
  x.type==='service'?<select id={id+x.key} value={value[x.key]??''} onChange={e=>set(x.key,e.target.value)}><option value="">{x.nullable?'No related service':'Choose a service'}</option>{services.map(s=><option key={s.id} value={s.id}>{s.name_en}</option>)}</select>:
  <input id={id+x.key} type={['number','money'].includes(x.type??'')?'number':'text'} step={x.type==='money'?'0.01':x.type==='number'?'1':undefined} value={value[x.key]??''} onChange={e=>set(x.key,e.target.value)}/>}</div>)}</div>;
}
const settings={catalog:{path:'services',key:'services',title:'Service catalog',fields:serviceFields},modifiers:{path:'modifiers',key:'modifiers',title:'Style modifiers',fields:modifierFields},
 inventory:{path:'inventory',key:'products',title:'Retail inventory',fields:productFields},events:{path:'events',key:'events',title:'Salon events',fields:eventFields},lookbook:{path:'lookbook',key:'looks',title:'Style lookbook',fields:lookFields}};
export function RecordsPanel({kind,...p}:Props&{kind:keyof typeof settings}){
 const config=settings[kind],[rows,setRows]=useState<any[]>([]),[editing,setEditing]=useState<any>(null),[value,setValue]=useState<Record<string,any>>(()=>initial(config.fields));
 const [error,setError]=useState(''),[registrations,setRegistrations]=useState<any[]|null>(null);
 useEffect(()=>{let current=true;api('admin/'+config.path).then(x=>{if(current){setRows(x[config.key]);setError('')}}).catch(e=>{if(current)setError(String(e))});return()=>{current=false}},[p.revision,config]);
 function edit(row:any){setEditing(row);setValue(initial(config.fields,row));setRegistrations(null)}
 async function save(){
  const body=Object.fromEntries(config.fields.map(x=>[x.key,x.type==='boolean'?value[x.key]:value[x.key]===''&&x.nullable?null:
   x.type==='number'?Number(value[x.key]):x.type==='money'?Math.round(Number(value[x.key])*100):value[x.key]]));
  if(kind==='inventory'&&editing)body.expectedStock=editing.stock_on_hand;
  if(await p.run(()=>api('admin/'+config.path+(editing?'/'+editing.id:''),editing?'PATCH':'POST',body)))edit(null);
 }
 return <><section className="card"><h3>{config.title}</h3><p className="note">{kind==='catalog'?'Changes apply to new requests. Existing appointment times and quotes are preserved.':kind==='inventory'?'Stock changes are audited. Items with zero stock or no price are hidden. Online checkout remains disabled.':kind==='events'?'Registered events cannot change time or price. Contact attendees before cancelling; external event notifications are not configured.':kind==='lookbook'?'New images are private drafts. Replacing an image or its source requires a new rights review.':'Review bilingual labels, time and price before enabling a modifier.'}</p>
  {error&&<p className="alert" role="alert">{error}</p>}
  <form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={p.busy}><legend>{editing?'Edit selected record':'Create a private draft'}</legend>
   <Inputs fields={config.fields} value={value} set={(key,v)=>setValue(old=>({...old,[key]:v}))} services={p.services}/>
   <div className="actions"><button className="primary" type="submit">{editing?'Save changes':'Create record'}</button>{editing&&<button className="secondary" type="button" onClick={()=>edit(null)}>New record</button>}</div></fieldset></form>
  <div className="tablewrap"><table><thead><tr><th>Record</th><th>Status / details</th><th>Actions</th></tr></thead><tbody>{rows.map(row=>{
   const name=kind==='modifiers'?row.label_en:row.name_en??row.name??row.title_en??row.caption_en??'Untitled';
   return <tr key={row.id}><td>{name}</td><td>{kind==='catalog'?`${row.duration_minutes??'Unapproved'} min · ${price(row.starting_price_cents)} · ${row.is_bookable?'Bookable':'Draft'} · ${row.is_visible?'Visible':'Hidden'}`:kind==='inventory'?`${row.stock_on_hand} units · ${price(row.unit_price_cents)} · ${row.available_for_sale?'Listed':'Hidden'}`:kind==='events'?`${row.status} · ${date(row.starts_at)} · ${price(row.price_cents)} · ${row.registered_seats} / ${row.capacity} seats`:kind==='lookbook'?(row.is_published?'Published':'Private draft'):`${row.name_en} · +${row.additional_minutes} min · +${price(row.additional_price_cents)} · ${row.is_enabled?'Enabled':'Disabled'}`}</td><td><div className="actions">
    <button className="secondary" disabled={p.busy} onClick={()=>edit(row)} aria-label={'Edit '+name}>Edit</button>
    {kind==='inventory'&&<button className="secondary" disabled={p.busy||(!row.available_for_sale&&(!row.stock_on_hand||row.unit_price_cents===null))} onClick={()=>void p.run(()=>api('admin/inventory/'+row.id+'/publish','POST',{publish:!row.available_for_sale}))}>{row.available_for_sale?'Hide':'List'}</button>}
    {kind==='events'&&<><button className="secondary" disabled={p.busy||row.status==='cancelled'} onClick={()=>void p.run(()=>api('admin/events/'+row.id+'/publish','POST',{publish:row.status!=='published'}))}>{row.status==='published'?'Unpublish':'Publish'}</button>
     <button className="danger" disabled={p.busy||row.status==='cancelled'} onClick={()=>{if(window.confirm('Cancel this event and its registrations? Contact attendees before continuing.'))void p.run(()=>api('admin/events/'+row.id+'/cancel','POST',{}))}}>Cancel event</button>
     <button className="secondary" disabled={p.busy} onClick={()=>void p.run(async()=>setRegistrations((await api('admin/events/'+row.id+'/registrations')).registrations),false)}>Registrations</button></>}
   </div></td></tr>})}</tbody></table></div>
  {registrations&&<div><h4>Event registrations</h4>{registrations.length?registrations.map(r=><p key={r.id}>{r.display_name??r.user_id} · {r.seats} seats · {r.status}</p>):<p>No registrations.</p>}</div>}
 </section>{kind==='lookbook'&&<><section className="card"><h3>Image publication review</h3><div className="lookgrid">{rows.map(row=><LookReview key={row.id+row.reviewed_at+row.image_url} row={row} {...p}/>)}</div></section><MediaPanel {...p}/></>}</>;
}
function LookReview({row,run,busy}:Props&{row:any}){
 const [rights,setRights]=useState(Boolean(row.rights_confirmed)),[note,setNote]=useState(row.rights_note??'');
 return <div className="look"><img src={row.image_url} alt={row.caption_en||'Private look draft'} referrerPolicy="no-referrer"/><div className="lookinfo"><h4>{row.caption_en||'Look draft'}</h4><p className="note">{row.is_published?'Published':'Private draft'}</p>
  <label className="check"><input type="checkbox" checked={rights} disabled={busy} onChange={e=>setRights(e.target.checked)}/>I verified rights and the subject’s publication consent</label>
  <Field label="Release or license reference" value={note} onChange={setNote}/><div className="actions">
   <button className="primary" disabled={busy||!rights||note.trim().length<10} onClick={()=>void run(()=>api('admin/lookbook/'+row.id+'/review','POST',{rightsConfirmed:rights,rightsNote:note,publish:true}))}>Approve publication</button>
   <button className="secondary" disabled={busy} onClick={()=>void run(()=>api('admin/lookbook/'+row.id+'/review','POST',{rightsConfirmed:rights,rightsNote:note,publish:false}))}>Keep private</button></div></div></div>;
}
function MediaPanel(p:Props){
 const [data,setData]=useState<any>({enabled:false,uploads:[]}),[error,setError]=useState('');
 useEffect(()=>{let current=true;api('admin/media').then(x=>{if(current)setData(x)}).catch(e=>{if(current)setError(String(e))});return()=>{current=false}},[p.revision]);
 return <section className="card"><h3>Private customer image queue</h3><p className="note">{data.enabled?'Preview each image privately and record release evidence. Approval keeps the object private; approved public imagery is managed in the lookbook above.':'Uploads and private previews await approved storage configuration. Approval is disabled.'}</p>{error&&<p className="alert">{error}</p>}
  {data.uploads.length?data.uploads.map((r:any)=><MediaReview key={r.id+r.status} row={r} enabled={data.enabled} {...p}/>):<p>No uploaded images awaiting review.</p>}</section>;
}
function MediaReview({row,enabled,run,busy}:Props&{row:any,enabled:boolean}){
 const [preview,setPreview]=useState(''),[note,setNote]=useState(''),[rights,setRights]=useState(false),[loaded,setLoaded]=useState(false);
 return <div className="card"><p>{row.id} · {row.content_type} · {row.byte_size} bytes · {row.status} · Consent {row.consent_confirmed?'recorded':'missing'}</p>
  {row.status==='pending_review'&&<><button disabled={busy||!enabled||!row.consent_confirmed} className="secondary" onClick={()=>void run(async()=>{setLoaded(false);setPreview((await api('admin/media/'+row.id+'/preview')).url)},false)}>Private preview (60 seconds)</button>
   {preview&&<img className="reviewImage" src={preview} alt="Private uploaded image for moderation" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>}
   <Field label="Review decision and release reference" value={note} onChange={setNote}/><label className="check"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>I inspected the image and verified publication rights</label>
   <button className="primary" disabled={busy||!enabled||!loaded||!rights||note.trim().length<10} onClick={()=>void run(()=>api('admin/media/'+row.id+'/review','POST',{approve:true,reviewNote:note,rightsConfirmed:rights}))}>Approve private image</button>
   <button className="danger" disabled={busy||note.trim().length<10} onClick={()=>void run(()=>api('admin/media/'+row.id+'/review','POST',{approve:false,reviewNote:note,rightsConfirmed:false}))}>Reject image</button></>}
 </div>;
}
export function TeamPanel(p:Props){
 const fieldId=useId();
 const [id,setId]=useState(''),[name,setName]=useState(''),[bio,setBio]=useState(''),[active,setActive]=useState(true),[account,setAccount]=useState(''),[quals,setQuals]=useState<string[]>([]);
 const [schedule,setSchedule]=useState<any>({shifts:[],timeOff:[]}),[error,setError]=useState('');
 const [shiftId,setShiftId]=useState(''),[day,setDay]=useState('1'),[start,setStart]=useState('10:00'),[end,setEnd]=useState('17:00');
 const [offId,setOffId]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[reason,setReason]=useState('');
 const [service,setService]=useState(''),[slotDate,setSlotDate]=useState(''),[slots,setSlots]=useState<string[]>([]);
 function select(value:string){const row=p.stylists.find(s=>s.id===value);setId(value);setName(row?.display_name??'');setBio(row?.bio??'');setActive(row?.is_active??true);setAccount(row?.user_id??'');setQuals(row?.service_ids??[]);setShiftId('');setOffId('');setSlots([])}
 useEffect(()=>{let current=true;setSchedule({shifts:[],timeOff:[]});setSlots([]);if(id)api('admin/stylists/'+id+'/schedule').then(x=>{if(current){setSchedule(x);setError('')}}).catch(e=>{if(current)setError(String(e))});return()=>{current=false}},[id,p.revision]);
 const selected=p.stylists.find(s=>s.id===id);
 return <><section className="card"><h3>Stylists & qualifications</h3>{error&&<p className="alert">{error}</p>}<fieldset disabled={p.busy}><div className="field"><label htmlFor={fieldId+'stylist'}>Stylist</label><select id={fieldId+'stylist'} value={id} onChange={e=>select(e.target.value)}><option value="">New stylist</option>{p.stylists.map(s=><option value={s.id} key={s.id}>{s.display_name}{s.is_active?'':' (inactive)'}</option>)}</select></div>
  <div className="form"><Field label="Approved stylist name" value={name} onChange={setName}/>{id&&<><Field label="Stylist biography" value={bio} onChange={setBio}/><Field label="Linked staff account ID (optional)" value={account} onChange={setAccount}/><label className="check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Active stylist</label></>}</div>
  <button className="primary" disabled={!name.trim()} onClick={()=>void p.run(()=>api('admin/stylists'+(id?'/'+id:''),id?'PATCH':'POST',id?{displayName:name,bio,isActive:active,userId:account||null}:{displayName:name}))}>{id?'Save stylist profile':'Add stylist'}</button>
  {id&&<><h4>Approved service qualifications</h4><p className="note">Select only services this stylist is trained to provide. Removing a qualification with an active appointment is blocked.</p><div className="grid">{p.services.map(s=><label className="check" key={s.id}><input type="checkbox" checked={quals.includes(s.id)} onChange={e=>setQuals(old=>e.target.checked?[...old,s.id]:old.filter(x=>x!==s.id))}/>{s.name_en}</label>)}</div><button className="secondary" onClick={()=>void p.run(()=>api('admin/stylists/'+id+'/services','POST',{serviceIds:quals}))}>Save qualifications</button></>}</fieldset></section>
  {id&&<><section className="card"><h3>Weekly shifts for {selected?.display_name}</h3><p className="note">Salon local time: America/New_York. Changes cannot overlap shifts or displace active appointments.</p><fieldset disabled={p.busy}><div className="form"><div className="field"><label htmlFor={fieldId+'weekday'}>Weekday</label><select id={fieldId+'weekday'} value={day} onChange={e=>setDay(e.target.value)}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></div><Field label="Shift start (local)" type="time" value={start} onChange={setStart}/><Field label="Shift end (local)" type="time" value={end} onChange={setEnd}/></div>
   <div className="actions"><button className="primary" onClick={()=>void p.run(()=>api(shiftId?'admin/shifts/'+shiftId:'admin/stylists/'+id+'/shifts',shiftId?'PATCH':'POST',{weekday:Number(day),startLocal:start,endLocal:end})).then(ok=>{if(ok)setShiftId('')})}>{shiftId?'Save shift':'Add shift'}</button>{shiftId&&<button className="secondary" onClick={()=>setShiftId('')}>New shift</button>}</div>
   {schedule.shifts.map((s:any)=><div className="scheduleRow" key={s.id}><span>Day {s.weekday}: {s.start_local}–{s.end_local}</span><button className="secondary" onClick={()=>{setShiftId(s.id);setDay(String(s.weekday));setStart(s.start_local.slice(0,5));setEnd(s.end_local.slice(0,5))}}>Edit shift</button><button className="danger" onClick={()=>{if(window.confirm('Remove this recurring shift? Active appointments must remain covered.'))void p.run(()=>api('admin/shifts/'+s.id,'DELETE'))}}>Remove shift</button></div>)}</fieldset></section>
   <section className="card"><h3>Staff time off</h3><fieldset disabled={p.busy}><div className="form"><Field label="Time off begins (ISO offset)" value={from} onChange={setFrom} placeholder="2027-01-15T10:00:00-05:00"/><Field label="Time off ends (ISO offset)" value={to} onChange={setTo}/><Field label="Time off reason" value={reason} onChange={setReason}/></div><div className="actions"><button className="primary" disabled={!from||!to} onClick={()=>void p.run(()=>api(offId?'admin/time-off/'+offId:'admin/stylists/'+id+'/time-off',offId?'PATCH':'POST',{startAt:from,endAt:to,reason})).then(ok=>{if(ok){setOffId('');setFrom('');setTo('');setReason('')}})}>{offId?'Save time off':'Add time off'}</button>{offId&&<button className="secondary" onClick={()=>{setOffId('');setFrom('');setTo('');setReason('')}}>New time off</button>}</div>
    {schedule.timeOff.map((s:any)=><div className="scheduleRow" key={s.id}><span>{date(s.start_at)}–{date(s.end_at)} · {s.reason}</span><button className="secondary" onClick={()=>{setOffId(s.id);setFrom(s.start_at);setTo(s.end_at);setReason(s.reason)}}>Edit time off</button><button className="danger" onClick={()=>{if(window.confirm('Remove this time-off block?'))void p.run(()=>api('admin/time-off/'+s.id,'DELETE'))}}>Remove time off</button></div>)}</fieldset></section>
   <section className="card"><h3>Real slot generator</h3><div className="form"><div className="field"><label htmlFor={fieldId+'service'}>Service</label><select id={fieldId+'service'} value={service} onChange={e=>{setService(e.target.value);setSlots([])}}><option value="">Choose a qualified service</option>{p.services.filter(s=>selected?.service_ids.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name_en}</option>)}</select></div><Field label="Salon-local date" type="date" value={slotDate} onChange={v=>{setSlotDate(v);setSlots([])}}/><button className="primary" disabled={p.busy||!service||!slotDate} onClick={()=>void p.run(async()=>{setSlots((await api('admin/slots?'+new URLSearchParams({serviceId:service,stylistId:id,date:slotDate}))).slots)},false)}>Generate slots</button></div><div className="actions">{slots.map(s=><span className="tag" key={s}>{date(s)}</span>)}</div></section></>}
 </>;
}
export function AuditPanel({run,busy,revision,role}:Pick<Props,'run'|'busy'|'revision'>&{role:string}){
 const [entries,setEntries]=useState<any[]>([]),[next,setNext]=useState<string|null>(null),[accounts,setAccounts]=useState<any[]>([]),[search,setSearch]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let current=true;api('admin/audit').then(x=>{if(current){setEntries(x.entries);setNext(x.nextBefore)}}).catch(e=>{if(current)setError(String(e))});return()=>{current=false}},[revision]);
 return <><section className="card"><h3>Management audit trail</h3>{error&&<p className="alert">{error}</p>}<p className="note">Changes and review evidence are recorded with the acting account. Records are read-only here.</p><div className="tablewrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Evidence</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{date(e.created_at)}</td><td>{e.actor_name??e.actor_id}</td><td>{e.action}</td><td><details><summary>View record</summary><pre>{JSON.stringify(e.details,null,2)}</pre></details></td></tr>)}</tbody></table></div>
  {next&&<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{const x=await api('admin/audit?before='+next);setEntries(old=>[...old,...x.entries]);setNext(x.nextBefore)},false)}>Load older records</button>}</section>
  {role==='admin'?<section className="card"><h3>Staff permissions</h3><p className="note">Only administrators can grant or revoke access. Accounts must first sign in. Use a second administrator to change your own role. Removing a staff role takes effect on the next API request.</p><div className="form"><Field label="Account ID or customer display name" value={search} onChange={setSearch}/><button className="secondary" disabled={busy} onClick={()=>void run(async()=>setAccounts((await api('admin/staff-accounts?search='+encodeURIComponent(search))).accounts),false)}>Find accounts</button></div>
   {accounts.map(a=><div className="scheduleRow" key={a.id}><span>{a.display_name??'Unnamed account'} · {a.id}</span><label htmlFor={'role-'+a.id}>Role for {a.display_name??a.id}</label><select id={'role-'+a.id} value={a.role} disabled={busy} onChange={e=>{const role=e.target.value;if(window.confirm('Change permissions for this account to '+role+'?'))void run(async()=>{await api('admin/staff-accounts/'+a.id,'PATCH',{role});setAccounts(old=>old.map(x=>x.id===a.id?{...x,role}:x))})}}>{['customer','stylist','manager','admin'].map(r=><option key={r}>{r}</option>)}</select></div>)}</section>:<p className="note">Staff permission changes require an administrator account.</p>}
 </>;
}

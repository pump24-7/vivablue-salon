"""Stage 4 management UI regression against the isolated loopback development stack.
Creates uniquely named synthetic drafts/staff/schedules; retains their audit trail.
No operational database, real image release, payment, or external message is used.
Requires the Stage 2 bootstrap and Python Playwright/Chromium.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import base64,hashlib,json,subprocess,uuid,re,shutil,os

root=Path(__file__).resolve().parents[2]
output=root/'work/dev/verification'
output.mkdir(parents=True,exist_ok=True,mode=0o700)
credentials=json.loads((root/'work/dev/credentials.json').read_text())
pub=subprocess.check_output(['openssl','x509','-in',str(root/'work/dev/tls/server.crt'),'-pubkey','-noout'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','DER'],input=pub)
pin=base64.b64encode(hashlib.sha256(der).digest()).decode()
tag='Stage4 '+uuid.uuid4().hex[:8]
day=(datetime.now(ZoneInfo('America/New_York'))+timedelta(days=5)).replace(hour=0,minute=0,second=0,microsecond=0)
results=[]
def passed(label):results.append(label);print('PASS:',label,flush=True)

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('VIVABLUE_CHROMIUM_BIN') or shutil.which('chromium'),headless=True,
  args=['--no-sandbox','--ignore-certificate-errors-spki-list='+pin])
 context=browser.new_context(viewport={'width':1280,'height':1000});page=context.new_page()
 page.on('dialog',lambda dialog:dialog.accept())
 try:
  page.goto('http://localhost:3000',wait_until='networkidle')
  page.get_by_role('link',name='Organization SSO sign-in').click()
  page.locator('#username').fill('dev-manager');page.locator('#password').fill(credentials['users']['dev-manager'])
  page.locator('#kc-login').click();page.wait_for_url('http://localhost:3000/',timeout=30000)
  expect(page.get_by_text('Studio synced successfully.',exact=True)).to_be_visible(timeout=30000)
  passed('Real organization SSO opens the existing management dashboard')
  def tab(name):page.get_by_role('button',name=re.compile(name)).click()
  def save(name):
   button=page.get_by_role('button',name=name,exact=True)
   expect(button).to_be_enabled();button.click()
   expect(page.get_by_text('Studio synced successfully.',exact=True)).to_be_visible(timeout=15000)
  def read(path):
   r=page.request.get('http://localhost:3000/api/bridge/admin/'+path)
   assert r.status==200,{'path':path,'status':r.status};return r.json()
  tab('Services')
  page.get_by_label('Service URL name',exact=True).fill(tag.lower().replace(' ','-'))
  page.get_by_label('Service name (English)',exact=True).fill(tag+' cut')
  page.get_by_label('Servicio (Español)',exact=True).fill(tag+' corte')
  page.get_by_label('Approved duration in minutes',exact=True).fill('45')
  page.get_by_label('Buffer in minutes',exact=True).fill('15')
  page.get_by_label('Starting price USD (blank = consultation)',exact=True).fill('35')
  page.get_by_label('Visible in customer catalog',exact=True).check()
  page.get_by_label('Approved for online requests',exact=True).check()
  save('Create record')
  service=next(s for s in read('services')['services'] if s['name_en']==tag+' cut')
  assert service['duration_minutes']==45 and service['starting_price_cents']==3500
  page.get_by_role('button',name='Edit '+tag+' cut',exact=True).click()
  expect(page.get_by_label('Starting price USD (blank = consultation)',exact=True)).to_have_value('35')
  page.get_by_label('Buffer in minutes',exact=True).fill('10');save('Save changes')
  passed('Service create/edit form loads saved values and persists approved time, buffer and server price')

  tab('Stylists & shifts');page.get_by_label('Approved stylist name',exact=True).fill(tag+' stylist');save('Add stylist')
  page.get_by_label('Stylist',exact=True).select_option(label=tag+' stylist')
  page.get_by_label(tag+' cut',exact=True).check();save('Save qualifications')
  page.get_by_label('Stylist biography',exact=True).fill('Synthetic browser verification profile');save('Save stylist profile')
  page.get_by_label('Weekday',exact=True).select_option(str(day.isoweekday()))
  page.get_by_label('Shift start (local)',exact=True).fill('10:00');page.get_by_label('Shift end (local)',exact=True).fill('18:00');save('Add shift')
  page.get_by_role('button',name='Edit shift',exact=True).click();page.get_by_label('Shift start (local)',exact=True).fill('11:00');save('Save shift')
  stylist=next(s for s in read('stylists')['stylists'] if s['display_name']==tag+' stylist')
  schedule=read('stylists/'+stylist['id']+'/schedule');assert schedule['shifts'][0]['start_local']=='11:00:00'
  assert stylist['service_ids']==[service['id']]
  passed('Explicit qualifications, stylist biography and recurring shift edits persist through the API')
  page.get_by_label('Time off begins (ISO offset)',exact=True).fill(day.replace(hour=13).isoformat())
  page.get_by_label('Time off ends (ISO offset)',exact=True).fill(day.replace(hour=14).isoformat())
  page.get_by_label('Time off reason',exact=True).fill('Synthetic absence');save('Add time off')
  assert len(read('stylists/'+stylist['id']+'/schedule')['timeOff'])==1
  page.get_by_label('Service',exact=True).select_option(service['id']);page.get_by_label('Salon-local date',exact=True).fill(day.date().isoformat())
  page.get_by_role('button',name='Generate slots',exact=True).click()
  expect(page.get_by_text('Request completed.',exact=True)).to_be_visible(timeout=15000)
  assert page.locator('.tag').count()>0
  page.screenshot(path=str(output/'stage4-team.png'),full_page=True)
  save('Remove time off');assert read('stylists/'+stylist['id']+'/schedule')['timeOff']==[]
  passed('Time-off controls and real slot generation work; removing the synthetic block restores the schedule')

  tab('Retail inventory')
  page.get_by_label('Product name',exact=True).fill(tag+' product');page.get_by_label('Stock units',exact=True).fill('5')
  page.get_by_label('Approved unit price USD',exact=True).fill('12.50');page.get_by_label('List in salon catalog',exact=True).check();save('Create record')
  page.get_by_role('button',name='Edit '+tag+' product',exact=True).click()
  expect(page.get_by_label('Stock units',exact=True)).to_have_value('5')
  page.get_by_label('Stock units',exact=True).fill('0');save('Save changes')
  item=next(x for x in read('inventory')['products'] if x['name']==tag+' product')
  assert item['stock_on_hand']==0 and not item['available_for_sale']
  passed('Inventory edit/restock form loads stock and automatically hides a zero-stock item')

  tab('Style lookbook')
  page.get_by_label('Approved HTTPS image URL',exact=True).fill('https://example.invalid/'+tag.replace(' ','-')+'.png')
  page.get_by_label('Caption (English)',exact=True).fill(tag+' image')
  page.get_by_label('Descripción (Español)',exact=True).fill('Imagen sintética de prueba');save('Create record')
  review=page.locator('.look').filter(has=page.get_by_role('heading',name=tag+' image',exact=True))
  expect(review.get_by_role('button',name='Approve publication',exact=True)).to_be_disabled()
  review.get_by_label('I verified rights and the subject’s publication consent',exact=True).check()
  expect(review.get_by_role('button',name='Approve publication',exact=True)).to_be_disabled()
  assert not next(x for x in read('lookbook')['looks'] if x['caption_en']==tag+' image')['is_published']
  expect(page.get_by_text('Uploads and private previews await approved storage configuration. Approval is disabled.',exact=True)).to_be_visible()
  passed('Lookbook stays private without release evidence; unconfigured private image approval remains disabled')

  tab('Events')
  page.get_by_label('Title (English)',exact=True).fill(tag+' event');page.get_by_label('Título (Español)',exact=True).fill(tag+' evento')
  page.get_by_label('Start ISO with offset',exact=True).fill(day.replace(hour=19).isoformat());page.get_by_label('End ISO with offset',exact=True).fill(day.replace(hour=20).isoformat())
  page.get_by_label('Capacity',exact=True).fill('10');save('Create record')
  row=page.get_by_role('row').filter(has=page.get_by_role('cell',name=tag+' event',exact=True));row.get_by_role('button',name='Publish',exact=True).click()
  expect(row.get_by_text(re.compile('published'))).to_be_visible(timeout=15000)
  page.get_by_role('button',name='Edit '+tag+' event',exact=True).click();page.get_by_label('Capacity',exact=True).fill('12');save('Save changes')
  row.get_by_role('button',name='Cancel event',exact=True).click();expect(row.get_by_text(re.compile('cancelled'))).to_be_visible(timeout=15000)
  assert next(x for x in read('events')['events'] if x['title_en']==tag+' event')['status']=='cancelled'
  passed('Event creation, publication, capacity editing and cancellation work through existing dashboard controls')

  tab('Policies & calendar')
  expect(page.get_by_label('Cancellation policy (English)',exact=True)).not_to_have_value('')
  page.get_by_label('Closure begins (ISO offset)',exact=True).fill(day.replace(hour=1).isoformat());page.get_by_label('Closure ends (ISO offset)',exact=True).fill(day.replace(hour=2).isoformat())
  page.get_by_label('Closure reason',exact=True).fill(tag+' closure');save('Add closure')
  closure=page.locator('.scheduleRow').filter(has_text=tag+' closure');closure.get_by_role('button',name='Edit closure',exact=True).click()
  page.get_by_label('Closure ends (ISO offset)',exact=True).fill(day.replace(hour=3).isoformat());save('Save closure')
  closure.get_by_role('button',name='Remove closure',exact=True).click();expect(closure).to_have_count(0,timeout=15000)
  passed('Current policies load for review; salon closure add/edit/remove persists')

  tab('Audit & access');expect(page.get_by_role('heading',name='Management audit trail',exact=True)).to_be_visible()
  expect(page.get_by_role('cell',name='closures.patch',exact=True).first).to_be_visible(timeout=15000)
  expect(page.get_by_text('Staff permission changes require an administrator account.',exact=True)).to_be_visible()
  assert page.request.get('http://localhost:3000/api/bridge/admin/staff-accounts').status==403
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(output/'stage4-audit-narrow.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  passed('Audit trail is visible, management cannot grant roles, and the narrow dashboard has no page overflow')
  for path in ['api/auth/logout','api/bridge/admin/stylists/'+stylist['id']]:
   r=page.request.post('http://localhost:3000/'+path,headers={'Origin':'https://external.invalid','x-vivablue-request':'admin'},data={})
   assert r.status in (403,405)
  assert page.request.patch('http://localhost:3000/api/bridge/admin/stylists/'+stylist['id'],headers={'Origin':'https://external.invalid','x-vivablue-request':'admin'},data={}).status==403
  assert page.request.delete('http://localhost:3000/api/bridge/admin/shifts/'+schedule['shifts'][0]['id'],headers={'Origin':'https://external.invalid','x-vivablue-request':'admin'}).status==403
  page.get_by_role('button',name=re.compile('Sign out')).click();expect(page.get_by_role('link',name='Organization SSO sign-in')).to_be_visible(timeout=15000)
  assert not any(c['name']=='vb_admin_session' for c in context.cookies())
  assert page.request.get('http://localhost:3000/api/bridge/admin/services').status==401
  passed('Logout/PATCH/DELETE reject foreign origins; real sign out clears the session and private bridge access')
 except Exception:
  page.screenshot(path=str(output/'stage4-failure.png'),full_page=True)
  output.joinpath('stage4-failure.txt').write_text(page.locator('body').inner_text())
  raise
 finally:context.close();browser.close()
output.joinpath('management-flow-results.json').write_text(json.dumps({'passed':results,'synthetic_prefix':tag,'private_storage_tested':False,'production_data_or_financial_services_used':False},indent=2)+'\n')

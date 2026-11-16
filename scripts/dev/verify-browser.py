"""Verify the isolated development stack with Chromium and Playwright.
Uses only loopback services and synthetic fixtures. Leaves cancelled test appointments
and test registrations for inspection. Never run against an operational database.
The browser test client does not prove native-device deep links or SecureStore behavior.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlencode,urlparse,parse_qs
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import base64,hashlib,json,secrets,ssl,subprocess,uuid,re,time,threading,shutil,os
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

root=Path(__file__).resolve().parents[2]
output=root/'work/dev/verification'
output.mkdir(parents=True,exist_ok=True,mode=0o700)
credentials=json.loads((root/'work/dev/credentials.json').read_text())
fixtures=json.loads((root/'scripts/dev/fixtures.json').read_text())
issuer='https://localhost:8443/realms/vivablue-dev'
tls=ssl.create_default_context(cafile=str(root/'work/dev/tls/ca.crt'))
pub=subprocess.check_output(['openssl','x509','-in',str(root/'work/dev/tls/server.crt'),'-pubkey','-noout'])
der=subprocess.check_output(['openssl','pkey','-pubin','-outform','DER'],input=pub)
pin=base64.b64encode(hashlib.sha256(der).digest()).decode()
results=[]
def passed(label):
 results.append(label);print('PASS:',label,flush=True)
def http(url,token=None,body=None,form=False,method=None):
 headers={}
 if token:headers['Authorization']='Bearer '+token
 if body is not None:
  headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
  data=(urlencode(body) if form else json.dumps(body)).encode()
 else:data=None
 try:
  with urlopen(Request(url,data=data,headers=headers,method=method),context=tls,timeout=15) as r:
   raw=r.read();return r.status,json.loads(raw) if raw else {}
 except HTTPError as error:return error.code,json.load(error)
def api(path,token=None,body=None,method=None):return http('http://127.0.0.1:4000'+path,token,body,method=method)
def b64(value):return base64.urlsafe_b64encode(value).decode().rstrip('=')
def customer_login(browser,register=False,bad_verifier=False):
 context=browser.new_context();page=context.new_page()
 verifier=b64(secrets.token_bytes(48));state=secrets.token_urlsafe(24)
 params={'client_id':'vivablue-browser-test','redirect_uri':'http://localhost:8089/callback',
  'response_type':'code','scope':'openid profile email offline_access','state':state,
  'code_challenge':b64(hashlib.sha256(verifier.encode()).digest()),'code_challenge_method':'S256',
  'audience':fixtures['audience']}
 page.goto(issuer+'/protocol/openid-connect/auth?'+urlencode(params),wait_until='networkidle')
 if register:
  page.get_by_role('link',name='Register',exact=True).click()
  page.locator('[name="firstName"]').fill('Development')
  page.locator('[name="lastName"]').fill('Signup')
  username='stage2-'+uuid.uuid4().hex[:12]
  page.locator('[name="username"]').fill(username)
  page.locator('[name="email"]').fill(username+'@example.invalid')
  password=secrets.token_urlsafe(30)
  page.locator('[name="password"]').fill(password)
  page.locator('[name="password-confirm"]').fill(password)
  submit=page.get_by_role('button',name='Register',exact=True)
 else:
  page.locator('#username').fill('dev-customer')
  page.locator('#password').fill(credentials['users']['dev-customer'])
  submit=page.locator('#kc-login')
 with page.expect_response(lambda r:r.status in (302,303) and r.headers.get('location','').startswith('http://localhost:8089/callback'),timeout=30000) as pending:
  submit.click(no_wait_after=True)
 location=pending.value.headers['location'];query=parse_qs(urlparse(location).query)
 assert query['state'][0]==state
 status,tokens=http(issuer+'/protocol/openid-connect/token',body={
  'grant_type':'authorization_code','client_id':'vivablue-browser-test','redirect_uri':'http://localhost:8089/callback',
  'code':query['code'][0],'code_verifier':secrets.token_urlsafe(48) if bad_verifier else verifier},form=True)
 if bad_verifier:
  assert status==400 and tokens['error']=='invalid_grant'
 else:assert status==200,{'status':status,'error':tokens.get('error')}
 context.close();return tokens

class Callback(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/plain');self.end_headers();self.wfile.write(b'Local protocol test callback received.')
 def log_message(self,*args):pass
callback=ThreadingHTTPServer(('127.0.0.1',8089),Callback)
threading.Thread(target=callback.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('VIVABLUE_CHROMIUM_BIN') or shutil.which('chromium'),headless=True,
  args=['--no-sandbox','--ignore-certificate-errors-spki-list='+pin])
 try:
  admin=browser.new_context(viewport={'width':1280,'height':900});page=admin.new_page()
  page.goto('http://localhost:3000',wait_until='networkidle')
  page.locator('a[href="/api/auth/login"]').click()
  page.wait_for_url(re.compile(r'https://localhost:8443/.*'))
  auth_query=parse_qs(urlparse(page.url).query)
  assert auth_query['audience']==[fixtures['audience']]
  assert auth_query['code_challenge_method']==['S256'] and auth_query['nonce']
  page.locator('#username').fill('dev-manager')
  page.locator('#password').fill(credentials['users']['dev-manager'])
  page.locator('#kc-login').click()
  page.wait_for_url('http://localhost:3000/',timeout=30000)
  expect(page.get_by_text('Studio synced successfully.',exact=True)).to_be_visible(timeout=30000)
  cookies=admin.cookies();session=next(c for c in cookies if c['name']=='vb_admin_session')
  assert session['httpOnly'] and session['sameSite']=='Lax'
  assert not any(c['name']=='vb_admin_oauth_flow' for c in cookies)
  passed('Admin organization sign-in: authorization code, PKCE, nonce/state, encrypted HttpOnly session and authenticated dashboard refresh')
  response=page.request.post('http://localhost:3000/api/bridge/admin/stylists',
   headers={'Origin':'https://external.invalid','x-vivablue-request':'admin'},data={'displayName':'Must not be created'})
  assert response.status==403
  assert page.request.get('http://localhost:3000/api/auth/callback?code=invalid&state=invalid').status==401
  passed('Admin bridge rejects cross-origin mutation; callback rejects invalid state')

  tokens=customer_login(browser)
  token=tokens['access_token']
  status,me=api('/api/me',token);assert status==200 and me['user']['role']=='customer'
  assert api('/api/admin/overview',token)[0]==403
  passed('Separate public browser test client completes PKCE exchange; real JWT authenticates customer and denies manager access')
  customer_login(browser,bad_verifier=True)
  passed('Public test client token endpoint rejects an incorrect PKCE verifier')
  status,refreshed=http(issuer+'/protocol/openid-connect/token',body={
   'grant_type':'refresh_token','client_id':'vivablue-browser-test','refresh_token':tokens['refresh_token']},form=True)
  assert status==200 and api('/api/me',refreshed['access_token'])[0]==200
  token=refreshed['access_token']
  passed('Development provider refresh token returns an API-valid access token')
  status,profile=api('/api/me',token,{'displayName':'Development Customer','preferredLanguage':'es'},method='PATCH')
  assert status==200 and profile['user']['display_name']=='Development Customer' and profile['user']['preferred_language']=='es'
  assert api('/api/me',token)[1]['user']['preferred_language']=='es'
  assert api('/api/me',token,{'role':'admin'},method='PATCH')[0]==400
  assert api('/api/admin/overview',token)[0]==403
  passed('Customer profile/name/language persist; profile mutation cannot grant staff permissions')
  day=(datetime.now(ZoneInfo('America/New_York'))+timedelta(days=2)).date().isoformat()
  status,available=api('/api/availability?'+urlencode({'serviceId':fixtures['serviceId'],
   'stylistId':fixtures['stylistId'],'date':day,'modifierIds':fixtures['modifierId']}))
  assert status==200 and available['slots']
  status,priced=api('/api/booking-quote?'+urlencode({'serviceId':fixtures['serviceId'],'stylistId':fixtures['stylistId'],
   'startAt':available['slots'][0],'modifierIds':fixtures['modifierId']}))
  assert status==200 and priced['quote']['totalCents']==3000 and priced['quote']['serviceMinutes']==60
  status,policies=api('/api/policies');assert status==200
  passed('Real API supplies the selected appointment quote before submission')
  status,booked=api('/api/bookings',token,{'serviceId':fixtures['serviceId'],'stylistId':fixtures['stylistId'],
   'startAt':available['slots'][0],'modifierIds':[fixtures['modifierId']],
   'consultationAck':True,'policyAccepted':True,'idempotencyKey':str(uuid.uuid4()),
   'expectedTotalCents':priced['quote']['totalCents'],'policyEffectiveAt':policies['policies']['effective_at']})
  assert status==200 and booked['appointment']['quoted_price_cents']==3000
  appointment=booked['appointment']['id']
  passed('Customer submits a real development appointment with modifier, consent and server price')

  def booking_status():
   status,data=api('/api/bookings',token);assert status==200
   return next(a['status'] for a in data['appointments'] if a['id']==appointment)
  page.get_by_role('button',name=re.compile('Appointments')).click()
  page.get_by_role('button',name=re.compile('Refresh')).click()
  expect(page.get_by_role('button',name='Confirm',exact=True)).to_have_count(1,timeout=15000)
  page.get_by_role('button',name='Confirm',exact=True).click()
  expect(page.get_by_text('Studio synced successfully.',exact=True)).to_be_visible(timeout=15000)
  for _ in range(30):
   if booking_status()=='confirmed':break
   time.sleep(0.1)
  assert booking_status()=='confirmed'
  passed('Existing admin appointment screen confirms the request; customer API sees confirmed status')
  assert api('/api/bookings/'+appointment+'/cancel-request',token,{})[0]==200
  page.get_by_role('button',name=re.compile('Refresh')).click()
  expect(page.get_by_text('cancel_requested',exact=True)).to_be_visible(timeout=15000)
  page.get_by_role('button',name='Cancel',exact=True).click()
  for _ in range(30):
   if booking_status()=='cancelled':break
   time.sleep(0.1)
  assert booking_status()=='cancelled'
  expect(page.get_by_text('cancelled',exact=True).first).to_be_visible(timeout=15000)
  passed('Customer cancellation request and admin screen cancellation complete through the existing API bridge')
  status,inbox=api('/api/me/notifications',token)
  assert status==200
  updates=[n for n in inbox['notifications'] if n['appointment_id']==appointment]
  assert sorted(n['status'] for n in updates)==sorted(['requested','confirmed','cancel_requested','cancelled'])
  assert api('/api/me/notifications/'+updates[0]['id']+'/read',token,{})[0]==200
  status,reread=api('/api/me/notifications',token)
  assert next(n for n in reread['notifications'] if n['id']==updates[0]['id'])['read_at']
  passed('Booking, admin confirmation and cancellation create durable customer inbox updates with read state')
  page.screenshot(path=str(output/'admin-appointments.png'),full_page=True)

  signup=customer_login(browser,register=True)
  status,user=api('/api/me',signup['access_token'])
  assert status==200 and user['user']['role']=='customer'
  assert api('/api/admin/overview',signup['access_token'])[0]==403
  passed('New account registration at development provider creates a customer record without staff privileges')
  assert api('/api/me/notifications',signup['access_token'])[1]['notifications']==[]
  assert api('/api/me/notifications/'+updates[0]['id']+'/read',signup['access_token'],{})[0]==404
  status,_=http(issuer+'/protocol/openid-connect/revoke',body={'client_id':'vivablue-browser-test',
   'token':refreshed['refresh_token'],'token_type_hint':'refresh_token'},form=True)
  assert status==200
  status,revoked=http(issuer+'/protocol/openid-connect/token',body={'grant_type':'refresh_token',
   'client_id':'vivablue-browser-test','refresh_token':refreshed['refresh_token']},form=True)
  assert status==400 and revoked['error']=='invalid_grant'
  passed('Separate accounts cannot read inbox updates; revoked provider refresh token is rejected')

  admin.close()
 finally:browser.close();callback.shutdown();callback.server_close()
output.joinpath('browser-flow-results.json').write_text(json.dumps({
 'passed':results,'native_device_tested':False,'native_redirect_verified':False,
 'public_client':'vivablue-browser-test',
 'tls':'Application/backend verify a local development CA; browser trusts only the generated certificate public-key pin.'},indent=2)+'\n')

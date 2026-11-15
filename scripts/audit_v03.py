"""Static v0.3 source assurance. Not a TypeScript compile, integration, mobile build or compliance sign-off."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
checks={}
def check(label,condition):
 checks[label]=bool(condition)
 if not condition:print('FAIL:',label)
api=(root/'apps/api/src/app.ts').read_text()
exp=(root/'apps/api/src/experience.ts').read_text()
admin=(root/'apps/admin/app/page.tsx').read_text()
home=(root/'apps/mobile/app/index.tsx').read_text()
my=(root/'apps/mobile/app/my-viva.tsx').read_text()
mobile_runtime='\n'.join(x.read_text() for x in list((root/'apps/mobile/app').glob('*.tsx'))+list((root/'apps/mobile/src').glob('*.tsx')))
server_runtime='\n'.join(x.read_text() for x in (root/'apps/api/src').glob('*.ts'))
check('v0.3 screens removed',all(not (root/f'apps/mobile/app/{p}.tsx').exists() for p in ('memberships','rewards')))
check('v0.3 active payment code removed',not (root/'apps/api/src/payments.ts').exists() and 'publicPaymentRoutes' not in api and 'securePaymentRoutes' not in api)
check('No active membership/reward routes',not re.search(r"app\.(?:get|post|put|delete)\(\s*['\"]/api/(?:memberships|me/memberships|me/rewards|admin/memberships|admin/rewards)",exp+server_runtime))
check('No Club/Rewards UI navigation',not re.search(r'/(?:memberships|rewards)|[\'\"](?:Club|Memberships|Rewards)[\'\"]',mobile_runtime+admin,re.I))
check('New Services route and direct Book shortcut', (root/'apps/mobile/app/services.tsx').is_file() and "'Book','/services'" in home)
check('My Viva loads visits & saved looks, not rewards', '/api/me/favorites' in my and '/api/bookings' in my and '/api/me/rewards' not in my)
check('Official website logo referenced by mobile & admin', 'vivabluesalon.com/images/33c922f60b7167724cbc786ad2dfe8c4.png' in (root/'apps/mobile/src/brand.ts').read_text() and 'vivabluesalon.com/images/33c922f60b7167724cbc786ad2dfe8c4.png' in (root/'apps/admin/src/brand.ts').read_text())
check('Blue-first customer and admin styles', '#249CF0' in (root/'apps/mobile/src/theme.ts').read_text() and '#1269b3' in (root/'apps/admin/app/globals.css').read_text())
check('Legacy data preserved and deactivated',all(t in (root/'db/migrations/003_v03_retire_rewards_memberships.sql').read_text() for t in ['SET is_published=false','SET is_enabled=false','membership_publication_retired','reward_earning_retired']))
check('Strong appointment no-overlap constraint preserved', 'EXCLUDE USING gist' in (root/'db/migrations/001_v01_baseline.sql').read_text() and 'salon_closures' in api and 'policyAccepted' in api)
check('Approved gallery images still protected', 'rights_confirmed=true' in exp and 'is_published=true' in exp)
check('Free events still capacity checked', 'FOR UPDATE' in exp and 'Paid event registrations' in exp)
check('No password/phone/email fields on home',not re.search(r'\b(TextInput|email|phone)\b',home,re.I))
check('Manager SSO preserved', 'href="/api/auth/login"' in admin and (root/'apps/admin/app/api/auth/login/route.ts').exists())
check('Media consent still gated', 'MEDIA_UPLOADS_ENABLED' in (root/'apps/api/src/media.ts').read_text())
check('Migration runner retained', (root/'scripts/migrate.ts').is_file())
missing=[]
for f in list(root.rglob('*.ts'))+list(root.rglob('*.tsx')):
 if 'node_modules' in str(f):continue
 for imp in re.findall(r"\bfrom\s*['\"](\.{1,2}/[^'\"]+)['\"]",f.read_text()):
  target=(f.parent/imp).resolve()
  candidates=[target,target.with_suffix('.ts'),target.with_suffix('.tsx'),Path(str(target).removesuffix('.js')+'.ts'),Path(str(target).removesuffix('.js')+'.tsx')]
  if not any(p.is_file() for p in candidates):missing.append((str(f.relative_to(root)),imp))
check('All relative source imports resolve',not missing)
report={'project':'Viva Blue Salon v0.3','status':'STATIC_VALIDATION_ONLY', 'checks':checks,'passed':sum(checks.values()),'total':len(checks),'missing_relative_imports':missing,
 'dependency_install':{'api':'BLOCKED: @aws-sdk/client-s3 not cached and registry unavailable','mobile':'NOT RESOLVED: packages not installed','admin':'NOT RESOLVED: packages not installed'},
 'package_resolved_build':'NOT RUN - missing npm dependencies','postgresql_migration':'NOT RUN - no database/test instance',
 'live_provider_and_device':'NOT RUN - no real OIDC, Stripe, S3, devices','official_logo':'Live website-hosted URL used; local owner-approved artwork not bundled',
 'source_parse':'TypeScript parser result recorded separately in validation output'}
(root/'docs/BUILD_REPORT.json').write_text(json.dumps(report,indent=2)+'\n')
print('v0.3 static audit',report['passed'],'/',report['total'],'checks')
if missing:print('Missing imports:',missing)
if report['passed']!=report['total']:raise SystemExit(1)

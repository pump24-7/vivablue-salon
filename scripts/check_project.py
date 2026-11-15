from pathlib import Path
root=Path(__file__).resolve().parents[1]
required=[
 'README.md','docker-compose.yml','db/001_init.sql','apps/api/src/app.ts','apps/api/src/scheduling.ts',
 'apps/api/src/auth.ts','apps/api/test/scheduling.test.ts','apps/mobile/app/index.tsx',
 'apps/mobile/app/service.tsx','apps/mobile/app/bookings.tsx','apps/admin/app/page.tsx'
]
missing=[f for f in required if not (root/f).exists()]
assert not missing,missing
home=(root/'apps/mobile/app/index.tsx').read_text()
assert '/api/properties' not in home
assert 'TextInput' not in home
assert 'email' not in home.lower() and 'phone' not in home.lower()
sql=(root/'db/001_init.sql').read_text()
assert 'EXCLUDE USING gist' in sql and 'btree_gist' in sql
assert 'is_bookable boolean NOT NULL DEFAULT false' in sql
print('PASS: conversion tree and home screen safety checks')

#!/usr/bin/env bash
# Mobile static export build.
# app/api/ is moved out during build because:
#   - API routes can't be statically exported (they use dynamic request values)
#   - The mobile app calls https://redorbi.com/api/* directly — never localhost
#   - Type imports from route files have been migrated to lib/types/ and lib/routing/server
# All changes are reverted via git checkout after the build.
set -euo pipefail

API_BACKUP="/tmp/orbi_api_mobile_$$"

restore() {
  if [ -d "$API_BACKUP" ]; then
    mv "$API_BACKUP" app/api
    echo "✓ app/api restaurado"
  fi
}
trap restore EXIT

mv app/api "$API_BACKUP"
echo "→ app/api movido a $API_BACKUP"

rm -rf .next
MOBILE_BUILD=true NEXT_PUBLIC_API_BASE=https://redorbi.com npm run build
echo "✓ Build móvil completado → out/"

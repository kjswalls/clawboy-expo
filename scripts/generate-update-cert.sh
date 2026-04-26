#!/usr/bin/env bash
# generate-update-cert.sh
#
# Generates a self-signed RSA-2048 key pair for expo-updates code signing.
# Run this ONCE when setting up a new project or rotating keys.
# The private key (private-key.pem) must NEVER be committed to git.
# The certificate (certificate.pem) IS safe to commit — it goes in app.json.
#
# Usage:
#   bash scripts/generate-update-cert.sh
#
# Output:
#   certs/private-key.pem   — keep secret; add to CI secrets + .gitignore
#   certs/certificate.pem   — commit to repo; referenced in app.json
#
# See: https://docs.expo.dev/eas-update/code-signing/

set -euo pipefail

CERT_DIR="$(dirname "$0")/../certs"
PRIVATE_KEY="$CERT_DIR/private-key.pem"
CERTIFICATE="$CERT_DIR/certificate.pem"

if [ -f "$PRIVATE_KEY" ]; then
  echo "⚠️  $PRIVATE_KEY already exists. Delete it first if you want to rotate keys."
  exit 1
fi

echo "→ Generating RSA-2048 private key..."
openssl genrsa -out "$PRIVATE_KEY" 2048

echo "→ Generating self-signed certificate (10-year validity)..."
openssl req -new -x509 \
  -key "$PRIVATE_KEY" \
  -out "$CERTIFICATE" \
  -days 3650 \
  -subj "/CN=ClawBoy OTA Signing/O=ClawBoy/OU=Updates"

echo ""
echo "✅ Done."
echo "   Private key : $PRIVATE_KEY  ← NEVER COMMIT THIS"
echo "   Certificate : $CERTIFICATE  ← safe to commit"
echo ""
echo "Next steps:"
echo "  1. Add certs/private-key.pem to .gitignore (already added)."
echo "  2. Store certs/private-key.pem in your CI secrets as EXPO_PRIVATE_KEY_PEM."
echo "  3. In CI, write it back out before running 'eas update':"
echo "       echo \"\$EXPO_PRIVATE_KEY_PEM\" > certs/private-key.pem"
echo "  4. Run 'eas update' with --private-key-path certs/private-key.pem"
echo "  5. Rebuild the native binary (eas build) so the new certificate.pem"
echo "     is embedded in the binary via the expo-updates plugin."

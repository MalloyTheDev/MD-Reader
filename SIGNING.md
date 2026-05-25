# Code signing the Windows installer

The installer (`dist/md-reader-<version>-setup.exe`) is **unsigned by default**, so Windows
SmartScreen shows an "unknown publisher" warning. Signing it with a certificate from a trusted
Certificate Authority removes that — though brand-new certificates still build SmartScreen
"reputation" over time/downloads before the warning disappears entirely.

> You provide the certificate; this repo is already wired to use it. I can't obtain a cert for
> you — CAs require a paid, identity-verified purchase, and OV/EV certs are typically issued to a
> hardware token (YubiKey) or a cloud HSM, not as a plain file.

The signing config lives under `win:` in `electron-builder.yml`. Pick **one** option below.

---

## Option A — Traditional certificate (.pfx file or cloud HSM)

Works if your CA gave you an exportable `.pfx`/`.p12`, or a cloud-signing tool that plugs into
`signtool` (DigiCert KeyLocker, SSL.com eSigner, etc.).

1. Get an **OV or EV code-signing certificate** from a CA (DigiCert, Sectigo, SSL.com, …).
2. Set environment variables, then build:

   **PowerShell**

   ```powershell
   $env:CSC_LINK = "C:\path\to\cert.pfx"   # or a base64 string of the .pfx
   $env:CSC_KEY_PASSWORD = "your-cert-password"
   npm run build:win
   ```

   electron-builder auto-detects `CSC_LINK`/`CSC_KEY_PASSWORD` and signs the app, the
   uninstaller, and the installer. No file changes required.

3. For HSM/token-based certs, follow your provider's `signtool` integration (they supply a
   crypto provider/dlib); electron-builder will use the machine's `signtool` once configured.

---

## Option B — Azure Trusted Signing (recommended for new certs)

Microsoft's cloud signing service — well suited to the post-Feb-2026 rules where standard certs
are 1-year and key-protected. No local hardware token needed.

1. In Azure: create a **Trusted Signing account** + a **certificate profile**, and an app
   registration (service principal) with the _Trusted Signing Certificate Profile Signer_ role.
2. Uncomment the `azureSignOptions` block in `electron-builder.yml` and fill in your
   `publisherName`, `endpoint` (your region's, e.g. `https://wus2.codesigning.azure.net/`),
   `certificateProfileName`, and `codeSigningAccountName`.
3. Set the service-principal env vars, then build:

   ```powershell
   $env:AZURE_TENANT_ID = "..."
   $env:AZURE_CLIENT_ID = "..."
   $env:AZURE_CLIENT_SECRET = "..."
   npm run build:win
   ```

---

## Verify the signature

```powershell
Get-AuthenticodeSignature "dist\md-reader-1.0.0-setup.exe" | Format-List
```

`Status` should be `Valid` and `SignerCertificate` your cert.

## Notes

- **OV vs EV**: EV certs get instant SmartScreen reputation but require hardware/HSM and cost more.
  OV (or Azure Trusted Signing) is cheaper; SmartScreen trust accrues as more users run it.
- **Never commit** your `.pfx`, passwords, or Azure secrets. Use env vars / CI secrets only
  (`.env*` is already excluded from the package in `electron-builder.yml`).
- Auto-update signature verification is not enabled (no auto-update server configured), so no
  extra signing steps are needed there.

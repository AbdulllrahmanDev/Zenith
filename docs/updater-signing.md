# Updater signing key

The updater only installs releases whose signature matches `plugins.updater.pubkey`
in `src-tauri/tauri.conf.json`. Whoever holds the matching private key can publish
updates that every installed copy will trust, so the key must belong to this project.

## Create the project's own key pair (once, on your machine)

```
bun tauri signer generate -w ~/.tauri/zenith.key
```

Choose a password. The command prints a public key and writes the private key to
`~/.tauri/zenith.key`.

1. Replace the `pubkey` value in `src-tauri/tauri.conf.json` with the printed public key.
2. In the repository settings, under Secrets and variables → Actions, set:
   - `TAURI_SIGNING_PRIVATE_KEY` = the full contents of `~/.tauri/zenith.key`
   - `TAURI_SIGNING_PASSWORD` = the password you chose
3. Keep an offline backup of the private key and the password. If either is lost,
   installed copies cannot be updated automatically again.
4. Never commit the private key or paste it into an issue or chat.

## Check it before a public release

Publish a pre-release, install the previous build, and confirm it updates. The steps
are in `RELEASE_CHECKLIST.md`; `scripts/verify-updater.mjs` checks the signature.

## Changing the identifier

The app identifier (`io.github.abdulllrahmandev.zenith`) decides the config folder
under `%APPDATA%`. On first start the app copies the previous folder
(`com.sehaz.zenith`) into the new one and renames old setting keys; the old folder
is left untouched as a backup. Installed copies signed under the old key cannot
update to a build with a new key, so existing users install this release manually once.

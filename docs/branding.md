# App icon and launch artwork

The two supplied black-and-white designs were installed on 17 October 2026. The source files are kept in `assets/branding/sources/` so exports do not depend on a developer's Downloads folder.

## Asset mapping

| File | Use |
| --- | --- |
| `assets/branding/sources/app-icon.png` | Supplied 1254 × 1254 app artwork, preserved unchanged |
| `assets/branding/sources/splash.png` | Supplied 941 × 1672 portrait artwork, preserved unchanged |
| `assets/icons/icon.png` | Opaque 1024 × 1024 iOS/default icon and existing in-app station fallback artwork |
| `assets/icons/adaptive-icon.png` | Transparent 1024 × 1024 Android foreground, with the logo contained inside the central safe area |
| `assets/icons/monochrome-icon.png` | White alpha silhouette for Android themed launcher icons |
| `assets/icons/notification-icon.png` | 96 × 96 white-on-transparent `ace` wordmark for ordinary Android notifications |
| `assets/icons/favicon.png` | 48 × 48 web favicon |
| `assets/splash/splash.png` | Exact supplied portrait image for the responsive loading fallback |
| `assets/splash/splash-icon.png` | 1024 × 1024 native splash export; only the portrait's empty black margins are cropped |
| `assets/store/google-play-icon.png` | Opaque 512 × 512 Google Play listing icon |

The Android transparent exports use the existing clean `assets/icons/logo-transparent.png` export of `assets/branding/ace-radio-logo.svg`, matching the supplied wordmark. No generative redraw was used. The launcher mark is 520 pixels wide on a 1024-pixel canvas; its complete bounding rectangle fits inside the central 66/108 diameter circle. The system applies the launcher mask and themed colours. The main iOS PNG has no transparency or pre-cut corners.

Regenerate the exports after intentionally updating the sources:

```sh
npm run branding:export
```

On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. This uses the image tooling already provided by Expo. It does not run during builds; all runtime PNGs are kept in the project.

## Native configuration and startup

`app.json` sets the default/iOS icon, black Android adaptive background, monochrome layer and separate notification symbol. The notification asset applies to `expo-notifications`; playback's media notification is managed separately by Expo Audio.

The `expo-splash-screen` plugin uses the supplied splash on a black background in both system appearances. iOS uses a 320-point image canvas. Android uses a 224-dp image canvas within its native splash area to keep the full wordmark inside the circular mask. These are platform-specific presentations of the same supplied artwork; the portrait poster is not stretched to fill Android's native launch window. Expo generates the density-specific resources. `expo-system-ui` enables the configured dark appearance and black native root background.

The splash stays visible while the bundled social-icon font loads. Once the navigation view lays out, the native splash hides with the configured short fade where supported. Font errors can proceed to the app. Catalogue requests, account restoration and network availability do not hold the splash open. There is no added minimum display delay.

## Required release checks

The assets and configuration need a **new native binary**; reloading JavaScript or sending an OTA update cannot replace an installed launcher icon or native splash.

```sh
npm run build:android
npm run build:ios
```

Use the existing preview profiles, with the usual Apple signing and registered-device provisioning for iOS. Expo Go and development clients do not reproduce the final native launch screen reliably. Test the installed preview or production app:

1. Check the iPhone home screen, App Library and system icon appearances; check iPad too, because tablet support is enabled.
2. Check Android circular and rounded-square launcher masks, themed icons on/off and light/dark system appearance.
3. Cold-launch the app and confirm the whole logo remains visible, the background stays dark and there is no duplicate splash or blank flash before Home.
4. Launch with no network connection; verify startup reaches the app rather than waiting on network data.
5. Check the Android notification symbol when ordinary notifications are implemented. Preparing its artwork does not implement push delivery.

Optional custom iOS dark/tinted artwork or an Apple Icon Composer asset can be added later. The current opaque PNG is a supported baseline. Store screenshots and the Google Play feature graphic remain separate release-marketing assets.

## Validation performed

- TypeScript and the existing 24 navigation/browser-input tests pass.
- Android, iOS and web JavaScript/assets export successfully.
- Isolated Android prebuild generates both launcher layers, the monochrome layer, notification resource and splash resources. Pixel checks confirm the full launcher mark stays inside the safe circle and the splash mark stays inside the native circular mask at all five densities in both appearances.
- iOS configuration introspection confirms `Dark` appearance, a black native root background and the `SplashScreen` launch storyboard. Expo's iOS image plugin exports the 320/640/960-pixel launch images and a centred storyboard in an isolated resource fixture.
- Browser checks show the supplied loading artwork before fonts finish loading and Home afterwards, with no page errors or horizontal overflow at 320/390/768-pixel widths.

These checks do not compile an Android/iOS binary or replace the installed-device checks above. No EAS build or store submission was started.

The compatibility check on 17 October also recommends newer patches for the existing Expo 57, Metro runtime, Asset, Constants, Linking, Notifications and Router packages. The newly added `expo-system-ui ~57.0.4` matches its recommendation. Those existing upgrades were not mixed into the branding change; review them alongside the dependency-advisory release check in `docs/accounts.md` before publishing.

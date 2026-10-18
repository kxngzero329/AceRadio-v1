# AceRadio typography

Outfit gives headings and show titles their rounded, bold character. Manrope
provides the everyday interface text, with consistent faces on Android, iOS and
web. The approved logo remains its original artwork.

| Role | Bundled face |
| --- | --- |
| Hero and full-player show titles | Outfit ExtraBold 800 |
| Page/section headings and show-card titles | Outfit Bold 700 |
| Buttons, tabs, form labels and badges | Manrope SemiBold 600 |
| Captions, schedule times and secondary metadata | Manrope Medium 500 |
| Body copy, descriptions and text inputs | Manrope Regular 400 |

`src/theme/fonts.ts` names the faces. `src/theme/typography.ts` supplies shared
type sizes and spacing; component styles use the same face names. Static font
files are addressed by their registered names without a separate `fontWeight`,
avoiding synthetic bold and inconsistent weight selection on native platforms.
Compact heading variants inherit the base heading face, and nested coloured
punctuation inherits the surrounding text font.

`src/theme/fontAssets.ts` references five local TTFs (about 392 KiB total).
The existing root `useFonts` call loads them together with the social icon fonts
behind the splash. Mobile builds bundle these assets for offline use; there are
no Google Fonts/CDN requests at runtime. The existing font-error path still
allows the interface to render if font loading fails. Native text scaling and
selectable text remain enabled; the app does not override global Text defaults.

The React Navigation theme uses the same font names. Form fields, modal copy,
account/security components, status messages and the mini-player have explicit
families, as well as the main pages. Letter spacing was softened for Outfit's
large headings while small uppercase badges retain their tracking.

## Source and licences

Font binaries were obtained on 18 October 2026 from the official
[Expo Google Fonts Outfit package](https://github.com/expo/google-fonts/tree/main/font-packages/outfit)
and [Manrope package](https://github.com/expo/google-fonts/tree/main/font-packages/manrope).
Copyright notices and the SIL Open Font License text are preserved beside the
assets as `Outfit-LICENSE.txt` and `Manrope-LICENSE.txt`, sourced from
[Google Fonts Outfit](https://github.com/google/fonts/tree/main/ofl/outfit) and
[Manrope](https://github.com/google/fonts/tree/main/ofl/manrope).
The binary headers and actual 400/500/600/700/800 weight metadata were checked;
these are static fonts, without a variable-font axis table.

The project uses its existing `expo-font` and splash integration without adding
font-package dependencies. See [Expo's font guidance](https://docs.expo.dev/develop/user-interface/fonts/).

## Verification

- TypeScript and 98 content, audio, listener, navigation, animation and web-input
  tests passed. The existing About render test now loads the font tokens too.
- Android, iOS and web exports include all five local font files.
- Forty-three browser scenarios passed across 320, 390, 430 and 768 px, including
  show details, account validation, chat, settings, favourites and player states.
  Computed fonts were checked for visible text and form fields, every face loaded
  successfully, and font requests stayed on the local asset host.
  Additional checks covered longer show titles and reachable player controls on
  the short 320×568 viewport.
- Captures were visually inspected for Home, the player and Settings; no browser
  page errors or horizontal page overflow occurred.

Ignored `.qa/typography-browser.cjs`, results and `.qa/typography-*.png` hold the
browser checks. Physical-device checks remain for iOS/Android glyph rendering
and larger system font sizes.

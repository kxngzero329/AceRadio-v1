# Chat chooser

The fourth bottom-navigation item is now **Chat**. It opens
`ChatOptionsModal` over the current tab without changing the selected page or
scroll position. About remains at `/about`, reachable from Home's **Our story**
action. Direct `/chat` links safely redirect to Home.

The chooser contains two distinct options:

- **Chat** uses the MessagesSquare icon and is marked **Coming soon**. Tapping
  it only displays “In-app chat is not available yet. It’s currently in
  development.” It deliberately remains tappable for that explanation rather
  than using a native disabled button that would prevent the notice.
- **WhatsApp** uses the Font Awesome WhatsApp brand icon and the existing
  `STATION.whatsapp` URL, `https://wa.me/27730676204`. The shared link helper now
  reports success/failure while preserving its existing alerts and callers.
  A successful launch dismisses the chooser; a failure keeps it open with a
  retryable inline error. Repeated taps during a pending launch are ignored.

The modal supports its close button, outside taps, Android's close request and
web Escape. It uses a short platform fade, respects reduced motion and safe
areas, scrolls on short screens, and stacks the options for large system fonts.
Web keyboard focus stays inside and returns to the launcher on dismissal.
Opening or closing the chooser does not control the audio player.

## Future in-app chat

The requested future feature is listener accounts plus one shared studio/admin
account, with its visible presenter name following the currently scheduled
show. No accounts, messages, admin assignment or presenter-name automation are
implemented by this chooser.

## Verification

- TypeScript, the 54 existing audio/navigation/web-input tests, and Android,
  iOS and web exports pass.
- Browser checks cover all visible tabs, preserved scroll positions, notice
  activation/reset, the exact WhatsApp URL, link failure/retry, close/backdrop/
  Escape, keyboard focus, reduced/default motion, About access and `/chat`.
- Layouts checked at 320, 390, 430 and 768 px, plus landscape. The real live
  stream continued playing through the chooser without another connection.
- URL checks intercept the browser launcher; they do not send a WhatsApp message.

Local captures/results are ignored under `.qa/chat-*`. Physical Android/iPhone
checks remain necessary for native WhatsApp handoff, system Back and device
accessibility settings.

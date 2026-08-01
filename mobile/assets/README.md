# Mobile app assets — not generated in this pass

No image-generation tooling was available in this session, so no actual
icon/splash image files exist yet. `mobile/app.config.js` deliberately omits
`icon`/`splash`/`android.adaptiveIcon` fields rather than pointing at files
that don't exist — that would break the Expo config outright. This file
documents exactly what's needed before those fields can be added.

## Design reference

The app is dark-only, flat, no gradients/glow (see the color tokens in
`mobile/src/ui/tokens.js` — background `#0b0b0d`, accent `#6b8afd`). Icon and
splash should match that visual language.

## Files needed

| File | Spec | Notes |
|---|---|---|
| `icon.png` | 1024×1024, PNG | **No alpha channel, no pre-rounded corners** — Apple rejects both. iOS applies its own corner mask. |
| `adaptive-icon-foreground.png` | 1024×1024, PNG, transparent background | Android adaptive icon foreground layer — keep the mark inside the safe zone (center ~66%), Android crops the rest into various shapes per launcher. |
| `adaptive-icon-background.png` (or a solid color) | 1024×1024 or a hex value | Android adaptive icon background layer. A solid `#0b0b0d` is simplest and matches the app background. |
| `splash-icon.png` | ~1200×1200, PNG, transparent background | Centered mark shown on `expo-splash-screen`'s solid background while the app boots. |
| `favicon.png` | 48×48 | Only used for the web build target (`expo start --web`), low priority. |

## Once the files exist, wire them into `mobile/app.config.js`

```js
icon: "./assets/icon.png",
android: {
  package: "com.openreply.app",
  adaptiveIcon: {
    foregroundImage: "./assets/adaptive-icon-foreground.png",
    backgroundColor: "#0b0b0d",
  },
},
plugins: [
  // ...existing plugins...
  [
    "expo-splash-screen",
    {
      image: "./assets/splash-icon.png",
      backgroundColor: "#0b0b0d",
      imageWidth: 200,
    },
  ],
],
```

(`expo-splash-screen` is already a dependency; it just isn't configured as a
plugin yet because there's no image for it to reference.)

## Fastest path to get these

Any of: a designer export, an AI image tool prompted with the color tokens
above ("flat, dark, no gradients" — matching `mobile/STORE_LISTING.md`'s
screenshot guidance), or Expo's own icon generator tooling
(`npx expo-splash-screen` interactive flow) once dependencies are installed
locally.

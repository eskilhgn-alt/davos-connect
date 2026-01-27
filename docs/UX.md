# PWA Design Bible – Lift & Lager (iPhone-first)

## 1) ÉN scroll-container per skjerm

- Skjermen består av: (1) sticky header, (2) content som scroller, (3) fixed bottom nav (global)
- Ingen "dobbel scroll" (ikke ScrollArea inni ScrollArea)
- Body skal ikke scrolle (app-shell styrer scroll)
- Bruk `overflow-hidden` på screen container, `overflow-y-auto overscroll-contain` på content

## 2) Safe-area er ikke valgfritt (iPhone notch/home-indicator)

- Bruk `env(safe-area-inset-*)` konsekvent
- Header må ha `safe-area-top`, bunnen må ha `safe-area-bottom`
- CSS tokens: `--bottom-nav-h: calc(4rem + env(safe-area-inset-bottom))`

## 3) iOS-tastatur må aldri ødelegge layout

- Bruk VisualViewport og CSS-variabler for app-height + keyboard inset
- Hook: `useVisualViewportVars.ts` setter `--app-height`, `--keyboard-inset`, `--keyboard-open`
- Når keyboard åpner: bottom nav skjules via `--bottom-nav-h-effective`

## 4) Stabil "app height"

- Bruk `height: var(--app-height)` for skjermer (ikke 100vh)
- Oppdater `--app-height` via VisualViewport (pixel-nøyaktig)

## 5) Touch-first regler

- Min 44pt tappbare flater (`h-11`/`h-12` eller `.tap-target`)
- Ingen små ikoner uten padding
- Tydelig "primary action" og maks 1-2 hovedvalg per view

## 6) Minimal tekst, tydelig hierarki

- Tittel + evt. 1 kort hjelpetekstlinje
- Unngå store blokker tekst
- Bruk cards og korte labels

## 7) Unngå layout-shift

- Ikke la elementer flytte seg når data laster; bruk skeleton/placeholder
- Ingen "jumping" ved tab-bytte

## 8) Inputs skal ikke trigge iOS zoom

- Sørg for `font-size >= 16px` i input/textarea (`text-base`)
- Ikke bruk `user-scalable=no` (tilgjengelighet). Løs zoom med font-size

## 9) Robust fallback for eksterne embeds

- Iframes kan bli blokkert (X-Frame-Options/CSP)
- Hvis en kilde ikke er embeddable: vis et pent fallback-kort med "Åpne i nettleser" knapp
- `DavosWebEmbed` har `embeddable` prop for dette

## 10) Konsistent spacing (8pt grid) + tokens

- Bruk eksisterende spacing/tokens fra `src/index.css`
- Ikke introduser tilfeldige farger
- Alt via semantic tokens: `--primary`, `--secondary`, `--muted`, etc.

---

## Standard Screen Pattern

```tsx
<div 
  className="flex flex-col overflow-hidden"
  style={{ height: "var(--app-height)" }}
>
  <AppHeader title="..." subtitle="..." />
  
  <div 
    className="flex-1 overflow-y-auto overscroll-contain"
    style={{ 
      paddingBottom: "var(--bottom-nav-h-effective)",
      WebkitOverflowScrolling: 'touch'
    }}
  >
    {/* Content here */}
  </div>
</div>
```

## CSS Variables (set by useVisualViewportVars)

- `--app-height`: Full viewport height (pixel-exact from VisualViewport)
- `--keyboard-inset`: Height of keyboard when open (0 when closed)
- `--keyboard-open`: Binary 0 or 1
- `--bottom-nav-h`: Full bottom nav height including safe area
- `--bottom-nav-h-effective`: Same as above, but 0 when keyboard is open
- `data-keyboard`: "open" or "closed" attribute on `<html>`

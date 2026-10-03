# Automatisk kameraavspilling — 21.09.2026

Nyeste bestilling: Avspilling starter ved sideåpning og kamerabytte, uten ekstra trykk.

## Årsak og faktisk kilde

Aktiv startversjon var 28284b4ff78ecc78bcb94c0235652bc091960012. Den lastet Skaping-iframe, men avspilling var ikke bevist. Offentlig spillerkode https://www.skaping.com/js/player.js?1789997807 venter i Launcher.start på click/touch på mobil før startAnimate. iframe allow=autoplay overstyrer ikke dette. Kameraenes utgangspunkt er ImageMedia, ikke kontinuerlig direktesendt video.

Skapings offentlige media/search-endepunkt returnerte ekte MP4-timelapse for alle ni konfigurerte Skaping-kameraer 21.09. Tilgangen svarte Access-Control-Allow-Origin: *. Kameraidentifikatorene er offentlige verdier fra leverandørens spiller-HTML; ingen hemmeligheter. Station ble observert avspillende i leverandørens nettleserspiller (paused=false, currentTime > 0, muted=true). Dette beviser kilden, ikke avspilling på brukerens fysiske iPhone.

## Endring

- Skaping åpnes som native video fra seneste tilgjengelige daterte timelapse. Ingen statisk arkivfil hardkodes. Offentlig manifest hentes først; cache fem minutter ved gjenåpning, ingen tunge avspillere for inaktive fliser.
- autoPlay, defaultMuted/muted, playsInline, loop, preload=auto og eksplisitt play() ved kilde/åpning/canplay/tilbakekomst. Ingen startknapp i normal- eller blocked-flyt. Brukeren kan pause en startet video og fortsette; egen pause respekteres ved tilbakekomst.
- Én aktiv videonode, samme node ved utvidelse; gammel forespørsel avbrytes/ignoreres ved kamerabytte. Én automatisk gjenoppretting ved kilde-/bufferfeil, deretter ærlig feilmelding og retry/leverandørlenke.
- Behold autorisert turkonfigurasjon og prioritet. Tidligere lagrede interaktive konfigurasjoner for de ni kjente Skaping-kildene oppgraderes under oppløsning uten å skrive databasen.
- Korrekt timelapse/dato, også uke-/månedsperiode. Historiske sesongklipp skal aldri merkes live. Trinum leverer stillbilder; disse oppdateres automatisk og kalles fortsatt stillbilder.
- Nettverk, leverandørstans og OS/autoplayrestriksjoner kan ikke garanteres bort. Ved NotAllowedError vises faktisk browserblokkering; ikke falsk «spiller»-status eller uendelig retry.

## Validering før import

27 relevante tester i tre filer består: native start uten klikk, muting/inline/loop, én spiller, utvidelse uten remount, kamerabytte og gamle svar, browserblokkerings-/canplayflyt, manuell pause, resolver/turgrenser, kildetillatelser og datomerking. TypeScript --noEmit og Vite/PWA-bygg består. Fysisk iPhone/PWA, innlogget Lovable-kamera og sanne nettverksoppstartstider er ikke bekreftet av enhetstester. Gjør konkret nettleserprøve når tilgjengelig; ikke markér fysisk gate lukket uten bevis.

## Resten av prosjektet

CLEAN-01A b8c14f8a9f6dadd395ec50a4f728a3175d77284f er fortsatt separat forberedt, ikke importert av denne pakken. Bevar denne kameraendringen når oppryddingen importeres. Ingen backend-/auth-/brukerdataendring, publisering eller testpush. SAVE-01/turtester, Chat-medier og sosiale fliser har uendret reell status. Les fersk Lovable-kunnskap før neste jobb.

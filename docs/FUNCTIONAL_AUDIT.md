# Funksjonsrevisjon – GüttaHütte

Status etter overgangen fra en Davos-app til en generisk turapp med
Val Thorens 2027 som aktiv tur. Dokumentet skiller mellom det som er solid i
koden, det som må enhetstestes i produksjon og det som bør bygges videre.

| Område | Nå | Vurdering | Neste viktige steg |
|---|---|---|---|
| Auth og profiler | Innlogging, registrering, passordreset, profil/avatar, admin-godkjenning, roller og utestenging | God privat-app-base | Styrk passordkrav og test alle e-postlenker på ekte domene |
| Chat | Realtime gruppechat, svar, redigering, sletting, reaksjoner, typing, lest-status, bilder/video/GIF, swipe og long-press | Moderne for ett lite crew; ikke full Messenger-plattform | Varig offline sendekø, opplastingsgjenopptak, rapportering/blokkering og eventuelle DM-/gruppetråder |
| Historier | 24-timers stories, bilde/video, kamera, tekst/tegning, reaksjoner, seere, skjermfangstsignal og privat media | Nær moderne sosial UX for en PWA | Kreative verktøy, publikumskontroll, adaptiv video og fysisk kameratest på flere enheter |
| Galleri | Feed, bilde/video, likes, kommentarer, paginering, komprimering og privat media | God turminnebok | Bakgrunnsopplasting, album/merking og bedre videotranscoding |
| Push | OneSignal-identitet, tokens, chat/story/poll/roomie/admin-flyt og idempotens | Koden er betydelig herdet | Deploy edge-funksjoner, aktiver eventuell OneSignal Identity Verification og kjør ende-til-ende enhetstest |
| E-post | Resend-basert serverutsending, hashede engangstokens og admin-e-post | Sikkerere kode, men driftsavhengig | Deploy, bekreft avsenderdomene/secrets og test levering/spam/lenker |
| Agenda | Ukeplan, opprette/redigere/slette, sanntid og tidsvalidering | Bra grunnfunksjon | Påminnelser, tidssone-/reisehåndtering og kalenderintegrasjon ved behov |
| Avstemninger | Realtime stemmer, frist, quorum, uavgjort, påminnelse og atomisk opprettelse | God gruppefunksjon | Serverstyrt cron for frist/avslutning og idempotent resultatmelding |
| Runder/utlegg | Deltakere, beløp, valuta, kvittering, oppgjør og atomiske DB-operasjoner | En av de sterkeste modulene | Eksport, avrundingspolicy og regresjonstest mot virkelige oppgjør |
| Roomies | Sikker tilfeldig trekning, par/gruppe på tre, redigering, rom og realtime | Riktig uten unødvendig AI | Deploy ny edge-funksjon og test countdown/flerbrukerflyt |
| Crew-kart | Frivillig posisjonsdeling, ferskhetsgrense, søk og OSM-kart | Riktig personvernretning | Proxy/rate-limit for geosøk, attribusjonskontroll og fysisk GPS-/batteritest |
| Vær | Open-Meteo fra sentral turkonfig, cache og offisiell Meteo-France-lenke | God generisk base | Resort-/høydespesifikk modell og observasjoner bygges i lokasjonsfasen |
| Webkamera/løypekart/live | Sikre lenker til offisielle Val Thorens-kilder | Robust fallback, men ikke ekte innebygd live-opplevelse | Velg offisielle API-er/feeds med tillatt embedding og cache/proxy |
| Skred/nød | Offisiell Meteo-France-lenke, franske nødnumre og generell sikkerhetsinfo | Ansvarlig: appen finner ikke på faregrad | Offisiell strukturert bulletin hvis lisens/API tillater det; alltid tydelig kilde/tidspunkt |
| AI-faktasjekk | Samtaler via Lovable AI og GPT-5.2 | For svak til å love kildebasert faktasjekk | Flytt til OpenAI Responses API med web search og eksplisitte kildereferanser; MCP kun for private/kuraterte turkilder |
| Admin | Brukere, roller, godkjenning, moderasjon, kunngjøring, push/e-post, feil og audit | Bredt og ryddet for gammel gamification | Test alle serverhandlinger etter edge-deploy og legg inn tydelig leveringsstatus |
| PWA/offline | Installerbar manifest, service worker, auto-update, appskall-, vær- og kartcache | Vesentlig forbedret | Varig offline kø og Lighthouse/enhetstest; følg opp store delte vendor-chunks |

## Produktvurdering

Dette er nå en god privat gruppeapp, men den er ikke teknisk eller
produktmessig «akkurat som Messenger, Instagram eller Snapchat». Det ville
kreve egne team for mediepipeline, moderering, anti-misbruk, tilgjengelighet,
offline sync, telemetri, adaptiv video, enhetsmatrise og kontinuerlig ytelse.
For ni venner er det riktigere å beholde ett tydelig gruppesamtalerom og noen
få sterke turfunksjoner enn å kopiere hele Meta/Snap-produktflaten.

Prioritet før nye Val Thorens-integrasjoner:

1. Få GitHub, Lovable-editoren og produksjonen på samme commit.
2. Deploy og ende-til-ende-test varsling/e-post/roomies på ekte telefoner.
3. Gjør poll-avslutning serverstyrt og legg til en varig offline sendekø.
4. Oppgrader faktasjekk til verktøybasert nettsøk med synlige kilder.
5. Deretter: resortvær, webkamera, løypekart og eventuelt strukturert skreddata.

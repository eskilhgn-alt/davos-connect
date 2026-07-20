# Sikkerhet og stack – GüttaHütte PWA

## Teknisk stack

| Lag | Teknologi |
|---|---|
| Frontend | React 18, TypeScript, Vite og Tailwind CSS |
| UI | shadcn/ui og egne generiske komponenter |
| Data/state | Supabase Realtime, TanStack Query og React Context |
| Backend | Lovable Cloud / Supabase |
| Database | PostgreSQL med Row Level Security (RLS) |
| Auth | Supabase Auth med e-post og passord |
| Media | Private Supabase Storage-buckets og kortlivede signerte URL-er |
| Push | OneSignal |
| E-post | Resend fra serverfunksjoner |
| AI | Lovable AI-gateway for faktasjekker |
| Kart/vær | Leaflet, OpenStreetMap/OpenSnowMap og Open-Meteo |
| PWA | Workbox via `vite-plugin-pwa`, automatisk oppdatering |

## Gjeldende sikkerhetsmodell

- Innlogging håndteres av Supabase Auth. Den lokale begrensningen av
  innloggingsforsøk er UX-beskyttelse; serverens Auth-regler er autoritative.
- Nye kontoer får standardrolle og må godkjennes av en admin før appen åpnes.
  `profiles.email_verified` brukes historisk som tilgangsgodkjenning, ikke som
  bevis på ende-til-ende-kryptering eller bekreftet e-post.
- Roller ligger i separat `user_roles`-tabell. Nybruker-triggeren kan ikke
  automatisk forfremme en bestemt e-postadresse.
- Delt gruppeinnhold er lesbart for aktive, autentiserte medlemmer. Private
  ressurser, admin-data, varslingstabeller og media har strengere RLS.
- Chat- og mediefiler leveres fra private buckets med signerte URL-er. URL-ene
  må ikke lagres som permanente offentlige lenker.
- Verifiseringstokens lagres kun som SHA-256-hash. Klarteksttoken finnes bare i
  e-postlenken og konsumeres atomisk av en service-role-funksjon.
- Push- og e-postutsendinger har idempotensnøkler og logges i den private
  `notification_dispatches`-tabellen for å hindre doble utsendinger.
- Klienten logger OneSignal-identiteten inn ved appstart og ut ved utlogging.
  Push-registrering alene garanterer ikke levering; edge-funksjoner, OneSignal-
  oppsett og ekte enhetstester må også være på plass.
- Utgåtte spill-, shot-, token-, frikort-, poeng- og skitabeller er arkivert.
  `public`, `anon` og `authenticated` har ikke tabell- eller RPC-tilgang.
- Frivillig crew-posisjon startes eksplisitt av brukeren, oppdateres kun mens
  appen er aktiv og slettes når deling stoppes. Foreldede posisjoner skjules.

## Nettleser og PWA

- `index.html` setter en referrer-policy. CSP, Permissions-Policy,
  `X-Content-Type-Options` og andre reelle sikkerhetsheadere må verifiseres som
  HTTP-responsheadere hos hosten; de skal ikke påstås basert på meta-tags.
- Error boundary og global håndtering av avviste promises hindrer at mange
  klientfeil blir helt stille, men erstatter ikke observability/serverlogger.
- Service worker precacher appskallet, oppdaterer seg automatisk og cacher vær
  og kartfliser med avgrenset levetid. Skriveoperasjoner har foreløpig ingen
  varig offline-kø.

## Dataklassifisering

| Type | Eksempler | Tilgang |
|---|---|---|
| Gruppe | Chat, historier, galleri, avstemninger, agenda | Aktive, autentiserte medlemmer |
| Privat | Push-tokens, verifiseringstokens, kvitteringer og mediafiler | Eier eller kontrollert serverfunksjon |
| Posisjon | Frivillig og kortlivet crew-posisjon | Aktivt medlem mens deling er slått på |
| Admin | Auditlogg, brukeradministrasjon, utsendelseslogg | Admin/service role |
| Arkiv | Utgått gamification og skistatistikk | Ingen direkte klienttilgang |

## Driftskrav før produksjon

1. Deploy alle endrede Supabase Edge Functions.
2. Kontroller `RESEND_API_KEY`, verifisert avsenderdomene, OneSignal-nøkler og
   tillatte app-URL-er i Supabase secrets.
3. Bekreft hosting-headere og kjør fysisk test på iPhone/Android for kamera,
   bakgrunn/oppvåkning, push, e-postlenker og installert PWA.
4. Ikke markér en integrasjon som ferdig kun fordi klientkoden bygger.

Sist oppdatert: 2026-07-20.

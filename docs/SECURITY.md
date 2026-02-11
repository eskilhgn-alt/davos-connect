# Sikkerhet & Stack – GüttaHütte PWA

## Teknisk stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| UI-bibliotek | shadcn/ui + egne Davos-komponenter |
| State | TanStack Query · React Context |
| Routing | React Router v6 |
| Backend | Lovable Cloud (Supabase) |
| Database | PostgreSQL med RLS |
| Auth | Supabase Auth (e-post/passord) |
| Push | OneSignal |
| E-post | Resend |
| AI | OpenAI (værsammendrag, faktasjekker) |
| Kart | Leaflet + OpenStreetMap |
| Hosting | Lovable Cloud |

---

## Sikkerhetstiltak

### 🔐 Autentisering
- **E-postverifisering** påkrevd for alle nye brukere (Resend + egendefinert token)
- **Rate-limiting** på innlogging: maks 5 forsøk, deretter 5 min lockout
- **Auto-utlogging** etter 30 min inaktivitet (idle timeout)
- **Passordkrav**: Minimum 6 tegn (Supabase default)
- **Rollebasert tilgang**: Admin-rolle i separat `user_roles`-tabell (ikke i profil)

### 🛡️ Data & tilgangskontroll
- **Row Level Security (RLS)** på alle tabeller – brukere ser kun egne data
- **Security Definer-funksjoner** for admin-operasjoner og rollesjekk
- **Separate admin-audit-logger** for sporbarhet
- **Privat token-lagring**: Push-tokens og OneSignal player_id lagres i private tabeller
- **`members_safe`-view** med `security_invoker = true` for sikker klient-tilgang

### 🌐 Nettverkssikkerhet
- **Content Security Policy (CSP)** via meta-tag – begrenser skript- og ressurskilder
- **Referrer-Policy**: `strict-origin-when-cross-origin` – forhindrer URL-lekkasje
- **Permissions-Policy**: Kun geolokasjon tillatt, kamera/mikrofon/betaling blokkert
- **X-Content-Type-Options**: `nosniff` – forhindrer MIME-type sniffing
- **HTTPS** tvunget via Lovable Cloud hosting

### 🔑 API & Edge Functions
- **JWT-validering** i alle kritiske Edge Functions via `supabase.auth.getUser()`
- **CRON_SECRET** for automatiserte prosesser (ski-daglige kåringer)
- **Private API-nøkler** lagret som Supabase Secrets (aldri i kode)
- **Giphy API-nøkkel** migrert fra hardkodet til environment variable
- **Webhook-signaturvalidering** der relevant

### 📱 PWA-herding
- **Kontekstmeny blokkert** (hindrer lang-trykk inspeksjon på mobil)
- **ErrorBoundary** fanger uventede feil globalt
- **Unhandled rejection handler** logger og varsler om asynkrone feil
- **Automatisk feilrapportering** – alle `errorToast`-kall logges til `bug_reports`

### 🚫 Brukerbeskyttelse
- **Ban-system**: Admin kan utestenge brukere med begrunnelse
- **Shot-ban**: Automatisk 12-timers utestengning ved regelbrudd
- **Disclaimer ved registrering**: Brukere må godta vilkår
- **Frikort-system**: Forhindrer urettferdig straff

---

## Dataklassifisering

| Type | Eksempler | Tilgang |
|------|-----------|---------|
| **Globalt (delt)** | Chat, topplister, streaks, shots, stories, galleri, kart | Alle autentiserte brukere |
| **Privat** | Tokens, frikort-saldo, kontoinnstillinger | Kun eier |
| **Admin** | Audit-log, admin-notater, brukeradministrasjon | Kun admin-rolle |

---

*Sist oppdatert: 2026-02-11*

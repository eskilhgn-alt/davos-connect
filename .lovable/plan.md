# GüttaHütte – teknisk revisjon (read-only)

Kilder: 3 parallelle utforskninger av hovedgrenens siste commit. Bygg/lint/tester kjørt read-only. Ingen filer, DB eller publisering endret. Klassifisering: **A** verifisert i kode, **B** implementert men skjør/ufullstendig, **C** legacy tilstede men uten UI, **D** mangler.

`bunx tsgo --noEmit` ✅ 0 feil. `bunx vitest run` ✅ 5 filer / 20 tester. `bunx eslint` ❌ **175 errors + 21 warnings** (mest `no-explicit-any` og auto-generert `mcp/index.ts`). Vite-build ikke kjørt (unngår `dist/`-mutasjon).

---

## 1. Auth

| Område | Klasse | Kilde |
|---|---|---|
| Login (`signInWithPassword`) | A | `AuthContext.tsx`, `AuthScreen.tsx:106` |
| Session-stabilitet (retry, ingen auto-logout) | A | `AuthContext.tsx:129-224` |
| Logout | A | `HomeScreen.tsx:88` |
| Passordreset – rute+handler | B | `/reset-password` finnes (`App.tsx:113`, `ResetPasswordScreen.tsx`), men `handleForgotPassword` er fjernet fra `AuthScreen.tsx` → **ingen UI-inngang** til å bestille reset |
| E-postverifisering | **C dobbel-system** | `send-verification-email` + `verify-email` + `VerifyEmailScreen` finnes, men aldri kalt fra signup. Reell gate er manuell admin (`profiles.email_verified` flippes i `AdminUserList.tsx:67`). `SECURITY.md:25` beskriver Resend-flyt som ikke lenger er aktiv |
| Obligatorisk profilbilde | A | `ProtectedRoute` i `App.tsx:80` + submit-gate |
| Ansvarsfraskrivelse-checkbox | B | Render bekreftet; håndhevelse i `handleSignup` ikke bekreftet (åpent) |
| Ban-gate | A | `App.tsx:88-96` |
| Rate limiting | B | `useAuthRateLimit.ts` er klient-only (15/2 min), `SECURITY.md` sier 5/5 min → doc-drift, og ingen serversidebeskyttelse |

## 2. Ruting og PWA-skall

- 4-fanet `BottomNavigation` (Hjem/Chat/Kart/Mer): **A**.
- `/magnus` fortsatt tilstede som `<Navigate to="/crew">` – **C** (skulle vært helt fjernet per prosjektkunnskap).
- `/shot`, `/tokens`, `/regler`, `/casino`, `/nodinfo` redirect → `/hjem` (A, som forventet), men underliggende sider (`ShotScreen.tsx`, `TokensScreen.tsx`, `ShotStatusCard`, `ShotTransparency`, `RulesScreen.tsx`, `ChecklistScreen.tsx`) kompilerer fortsatt og bidrar til lint/bundle: **C**.
- `BackButton.tsx:25` bruker alltid `navigate(fallback, {replace:true})` – riktig oppførsel, men filens egen JSDoc påstår `history.back()` (doc-mismatch, **B**).
- `FloatingHomeButton.tsx`: **null bruksteder** – **C dead**.
- OAuth-consent-rute (`/.lovable/oauth/consent`) bruker beta-API via `unknown`-cast: **B**, funksjonell men utypede kall.
- Manifest: én 512×512-ikon, ingen maskable/192px – **B minimalt**.
- Service worker: kun OneSignal SW; ingen app-cache – offline er **D** utover `OfflineIndicator`-banner.
- iOS-keyboard: `useVisualViewport` mounter kun i `ChatScreen.tsx:22` og setter `--vvh/--vvo/--kb`. `--app-height` er statisk `100dvh` i CSS og oppdateres aldri. Resten av appen bruker `var(--app-height)` og faller ned til `100dvh` – funker, men matcher ikke `docs/UX.md`/mem-beskrivelsen: **B doc-drift**.
- Head-metadata i `index.html`: riktig tittel/description/OG, ikke maldefaults – **A**. CSP/Permissions-Policy er *ikke* satt som meta (kommentaren i filen sier de må være HTTP-headere) → avhengig av vertens headere; ikke verifisert.
- Pull-to-refresh, ErrorBoundary, OfflineIndicator, `useGlobalPwaHardening`: **A**.

## 3. Chat

| Aspekt | Klasse | Bevis |
|---|---|---|
| Realtime | B | `chat/store.ts:108-127` gjør full `fetchMessages()` (limit 500) ved hvert `*`-event, ingen inkrementell patch, ingen egen reconnect/backoff |
| Optimistisk send | **D** | `store.ts:137-256` awaiter insert; UI oppdateres kun etter refetch |
| Offline-kø / retry | **D** | Ikke funnet |
| Paginering | **D** | Hardcoded `.limit(500)` uten cursor/«last mer» |
| Uleste + `chat_reads` | A | `useMarkAsRead.ts` (debounced upsert) |
| Sett-av / read-receipts | A | `MessageActionsSheet.tsx:43-85` |
| Typing indicator | **C misledende** | `store.ts:319-351` sender **lokalt CustomEvent** – aldri broadcastet til andre klienter, men UI (`TypingBubble`) later som det er delt |
| Reaksjoner | A | `store.ts:281-317` (optimistisk lock, 3 retries) |
| Reply (parent/thread) | **D** | Ingen kolonne/UI |
| Edit / soft delete | A | `edited_at` / `deleted_at` |
| Vedlegg image/GIF/emoji | A | `chat-media`, `GiphyPicker`+`giphy-proxy`, `EmojiPicker` |
| PDF / vilkårlig fil | **D** | `types.ts` støtter kun `image\|video\|gif` |
| Push-deep-link | B | `send-push-notification/index.ts:136` → `/chat` uten `message_id` |
| iOS-keyboard scroll-lock | A | `useVisualViewport` + `chat-lock` klasse |
| Moderasjon / RLS | **B kritisk** | `messages` DELETE-policy krever kun `auth.uid() IS NOT NULL` – enhver autentisert bruker kan slette hvilken som helst melding (`20260206103419...sql:23-43`). Samme for UPDATE. |

## 4. Media (galleri + stories)

- `gallery_items` sync fra chat: **A** insert; men `GalleryScreen.tsx:74-91` **gjetter bucket** basert på `source_message_id` → **B skjør**.
- Chat lager `_thumb.jpg` og lagrer bare i `attachments.thumbUrl` – ikke i `gallery_items` schema, så galleri-feed rendrer alltid full-res: **B**.
- Captions: **D**.
- Delete/download/lightbox/realtime: **A**.
- Stories: capture, viewer, ring, likes (`story_likes`), 24h expiry (`expires_at DEFAULT now()+24h`), viewer-liste: **A**.
- Vidvinkel-linsevalg + prefetch (per mem-note): **D** – kun `facingMode`-toggle.
- EXIF-scrubbing: ikke funnet eksplisitt (canvas-reencode via `imageThumb` fjerner det de-facto): åpent.

## 5. Push

- OneSignal-init: App ID **hardkodet** i `src/services/onesignal.ts:8`; `VITE_ONESIGNAL_APP_ID` refereres kun i feilmelding → **B doc/env-drift**.
- SW-filer i `public/push/onesignal/`, `scope: /push/onesignal/`: A.
- Token-lagring: dobbeltskriving til `members.push_token` (legacy) og `push_tokens` (`onesignal.ts:194-299`); `send-push-notification` slår sammen begge → **B to sannheter**.
- Kanaler: `send-push-notification` (chat), `poll-push`, `round-push`, `shot-push`, `roomie-draw`, `broadcast-reinstall`, `notify-admin-new-user`. Alle verifisert kaller `api.onesignal.com/notifications`.
- **Ingen proximity/«dawg»-push** funnet i src eller edge functions – **fjernet, A**.
- Deep-links: alle rute-nivå, aldri item/message-nivå – **B**.
- Duplikatundertrykkelse: kun chat bruker `collapse_id: thread_${thread_id}`. Poll/round/shot har ingen cooldown/collapse → potensielt spam-vindu, **B**.
- Admin-verktøy `AdminPushTools`: **A**, men in-code-kommentar er utdatert (RLS ble senere åpnet for admin).

## 6. E-post

- Kun én funksjon bruker Resend: `send-verification-email`. Avsender = **Resend sandbox `onboarding@resend.dev`** (`:112`) → leveranse-risiko på ekte konto, **B**.
- Ingen egendefinert domene, ingen `email_events`/webhook-logg – **D**.
- `broadcast-reinstall/index.ts:105` har kommentar `// Email sending removed` og returnerer *ikke* `emails_sent`, men UI-toasten `AdminAnnouncements.tsx:77` skriver `E-post: ${result.emails_sent}` → vises som `E-post: undefined`. **C legacy + UI-mismatch**.
- Supabase-native auth-e-poster: ingen `[auth.email]`-blokk i `config.toml`; må verifiseres i prosjektinnstillinger.

## 7. Sekundærfunksjoner

Agenda, polls, roomies, rounds, gruppe/profil, admin, faktasjekker, kart+lokasjons-opt-in, vær (Open-Meteo + Meteo-France-link), webcams, MCP: alle rutet og har relevante RPC-er/edge functions → **A** for grunnfunksjonalitet (proven end-to-end krever manuell test).

## 8. Datalag

- Edge functions (17 stk, alle `verify_jwt=false` per `supabase/config.toml`): admin-delete-user, admin-reset-password, notify-admin-new-user, broadcast-reinstall, award-points, ski-daily-award, shot-push, shot-fairness-check, poll-push, round-push, roomie-draw, send-push-notification, faktasjekker, giphy-proxy, send-verification-email, verify-email, mcp. Fire av dem (**`award-points`, `shot-push`, `shot-fairness-check`, `ski-daily-award`**) betjener fjernet gamification-UI, men er fortsatt deployert og eksternt kallbare – **C legacy angrepsflate**. Intern JWT-validering per funksjon er ikke individuelt gjennomgått.
- Migrasjoner: 75 filer, ingen destruktive fanget, men grep var ikke uttømmende (åpent).
- RLS: bekreftet enabled på ~25+ tabeller via migrasjonstekst. `poll_options`, `round_participants`, `bug_reports` og storage-bucket-policies dukket **ikke** opp i grep – trenger live `pg_policies`-query for å lukke.
- **GRANT-statements**: 0 treff for `GRANT ... TO authenticated` i migrasjoner. Trolig avhengig av Supabase default-grants, men bør verifiseres live.
- Realtime-publikasjon inkluderer fortsatt `shot_events`, `shot_event_log`, `ski_daily_vertical/awards`, `ski_speed_records`, `ski_track_points` – legacy-kanaler live selv om UI-en er dødredirigert: **C**.
- **SECURITY DEFINER uten `SET search_path`**: én migrasjon uten den (`20260206103453_...sql`) – **kritisk** å inspisere; ellers privilege-eskalering via search_path-hijack.
- **RLS på `messages`**: UPDATE og DELETE tillater enhver autentisert bruker mot enhver rad – **kritisk misconfig** (se §3).

## 9. Bygg / lint / tester

- `tsgo --noEmit`: 0 feil ✅
- `vitest run`: 20/20 ✅
- `eslint`: 175 errors + 21 warnings – 6× `no-var` i auto-generert `supabase/functions/mcp/index.ts` (ikke actionable), resten dominert av `no-explicit-any` i edge functions (`award-points` 8×, `shot-fairness-check` 9×, `roomie-draw`, `round-push`, `send-verification-email`, `broadcast-reinstall`) og døde sider (`ShotScreen`, `TokensScreen`, `RoundsScreen:106`, `onesignal.ts:79,111,125`), `tailwind.config.ts:151` `no-require-imports`.
- 0 TODO/FIXME i src/ og edge functions.

## 10. Davos-/legacy-strenger

- `DAVOS_CENTER`/`DAVOS`-aliaser i `config/mountains.ts:30`, `config/locations.ts:27`, `SkiRouteMap.tsx:36,82` – kosmetisk **C**.
- `/* === DAVOS PRIMARY COLORS === */`-kommentar i `index.css:29`.
- Migrasjon: seed-rad `('davos_agg', ...)` – historisk, harmløs.
- `docs/SECURITY.md` og `docs/UX.md` refererer stale komponenter (`DavosWebEmbed`, Resend-verifisering, keyboard-hook-navn) som ikke matcher kode – **doc-drift**.
- Ingen treff på `siscontrol`, `meteoswiss`, `slf`, `chf`, `casino` som aktiv kode.
- Fortsatt tilstede men uten UI: `Monsterrunde`-strenger i `ShotScreen`/`ShotStatusCard`/`ShotTransparency`.

---

## Prioritert opprydding

### Kritisk (sikkerhet/data-integritet)
1. **Stram `messages` RLS**: UPDATE/DELETE må kreve `sender_id = auth.uid()` (evt. `OR is_admin(auth.uid())`). I dag kan enhver innlogget bruker slette/endre alles meldinger.
2. **Verifiser `SECURITY DEFINER`-funksjon uten `SET search_path`** i `20260206103453_...sql` – legg til `SET search_path = public` hvis den mangler.
3. **JWT-validering i edge functions**: bekreft at hver `verify_jwt=false`-funksjon (spesielt `admin-delete-user`, `admin-reset-password`, `broadcast-reinstall`, `notify-admin-new-user`) selv validerer caller og admin-rolle.
4. **Live RLS/GRANT-audit** via `supabase--read_query` mot `pg_policies` og `information_schema.role_table_grants` for `poll_options`, `round_participants`, `bug_reports`, `storage.objects`. Bekreft at ingen tabell er «lockdown by mistake» eller «wide open by mistake».
5. **Riv ned legacy gamification-flate**: enten slett eller lås ned `award-points`, `shot-push`, `shot-fairness-check`, `ski-daily-award` (eksternt kallbare i dag); fjern `shot_events`, `shot_event_log`, `ski_*` fra `supabase_realtime`-publikasjonen.

### Høyt (kjernefunksjonalitet)
6. **Chat-refetch → inkrementell**: håndter INSERT/UPDATE/DELETE-events direkte mot lokal state i stedet for `.limit(500)` refetch. Legg til cursor-paginering.
7. **Chat: optimistic send + retry-kø** slik at meldinger ikke føles trege og overlever midlertidig nettbrudd.
8. **Typing indicator**: enten broadcast reelt (Supabase `presence`/`broadcast`) eller fjern `TypingBubble`-illusjonen.
9. **E-postverifisering**: velg én sannhet. Enten koble `send-verification-email`/`verify-email` inn i signup, eller slett dem sammen med `VerifyEmailScreen.tsx` og oppdater `SECURITY.md`.
10. **Passord-glemt-inngang**: legg tilbake UI-trigger i `AuthScreen` som kaller eksisterende `resetPassword()` (rute + handler finnes allerede).
11. **`AdminAnnouncements.tsx:77`**: fjern `E-post: ${result.emails_sent}` eller gjenopprett e-post-branch i `broadcast-reinstall`.
12. **Resend-avsender**: bytt fra `onboarding@resend.dev` til verifisert domene før noe transaksjons-mail sendes ut i produksjon.

### Middels (opprydding og drift)
13. Slett død UI-kode: `ShotScreen.tsx`, `TokensScreen.tsx`, `ShotStatusCard.tsx`, `ShotTransparency.tsx`, `RulesScreen.tsx`, `ChecklistScreen.tsx`, `FloatingHomeButton.tsx` (0 kallere).
14. Fjern `/magnus`-ruten – prosjektkunnskapen sier den skal vekk.
15. Rens `DAVOS_CENTER`/`DAVOS`-aliaser og kommentar i `index.css:29`.
16. Konsolider push-token-lagring til `push_tokens` alene; deprecate `members.push_token`.
17. Les OneSignal App ID fra `VITE_ONESIGNAL_APP_ID` (fjern hardkodet konstant).
18. Legg til `collapse_id`/cooldown i `poll-push`, `round-push`, `shot-push`(hvis den fortsatt lever) for å hindre spam.
19. Push-deep-links: inkluder `?message_id`/`?poll_id` og scroll-til-mål ved åpning.
20. `BackButton.tsx` JSDoc: rett kommentaren så den matcher `replace:true`-oppførselen.
21. `useAuthRateLimit.ts` vs `SECURITY.md`: bring i overensstemmelse (5/5 eller 15/2 – ta et valg) og vurder server-side kontroll.
22. Manifest: legg til 192px + maskable ikon.

### Lav (dokumentasjon / kosmetisk)
23. Oppdater `docs/SECURITY.md`, `docs/UX.md`, `docs/LEGACY.md` til å matche implementasjon (verifiseringsflyt, keyboard-hooks, `DavosWebEmbed`-referanse).
24. Rydd `no-explicit-any` i edge functions (typesnitt fra Supabase-payloads); ekskluder `supabase/functions/mcp/index.ts` fra ESLint (auto-generert).
25. Kaptions-felt på `gallery_items` + gjenbruk thumbnail fra chat i galleri-feed.
26. Vurder `PDF/fil`-vedleggstype hvis det faktisk er ønsket – i dag mangler det helt.

---

## Åpne spørsmål før implementasjon

- Skal legacy shot/token/ski-tabeller og edge functions **slettes** eller **arkiveres i live-DB men fjernes fra publikasjon+deploy**? Prosjektkunnskap sier «arkiver, ikke drop».
- E-postverifisering: manuell admin-godkjenning (som i dag) beholdes som eneste sannhet, eller skal Resend/token-flyten reaktiveres?
- Er `LocationSharingProvider` med vilje kun mountet i `AppLayout` (ikke `ChatLayout`)?
- CSP/Permissions-Policy: settes disse som HTTP-headere hos hosten? Hvis ikke, må vi legge dem inn.

Ved godkjenning starter jeg med kritisk-listen (§1-5) i én PR-serie før jeg tar høyt/middels.

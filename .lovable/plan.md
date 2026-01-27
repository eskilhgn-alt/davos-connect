
# Sprint 2.0: Messenger-lignende Chat-opplevelse

## Oversikt

Bygge en fullverdig lokal chat-app som føles "native" på mobil, med sticky header/input, meldingsliste som scroller, mediestøtte, reaksjoner og moderne interaksjoner.

## Nåværende tilstand

- AppLayout har `pb-20` på main som må fjernes
- ChatScreen er en tom "kommer snart"-side
- Eksisterende komponenter: DavosButton, DavosInput, DavosAvatar, Dialog, Sheet, ContextMenu
- chatService i contracts.ts er "not implemented"
- Ingen GIPHY API-nøkkel konfigurert (må legges til for GIF-støtte)

## Implementasjonsplan

### Fase 1: Layout-korreksjon (Kritisk grunnlag)

**1.1 Gjør AppLayout "tynn"**

Fil: `src/components/layout/AppLayout.tsx`
- Fjern `pb-20` fra main-wrapper
- La hver side håndtere egen spacing
- Resultat: `<div className="min-h-screen bg-background"><Outlet /><BottomNavigation /></div>`

**1.2 Restructurer ChatScreen layout**

Fil: `src/pages/ChatScreen.tsx`
- 100dvh-basert container med flex-col og overflow-hidden
- AppHeader sticky øverst (safe-area-top)
- MessageList = flex-1 med overflow-y-auto og overscroll-contain
- ChatComposer sticky nederst med korrekt offset: `bottom: calc(4rem + env(safe-area-inset-bottom))`

### Fase 2: Datamodell og lokal lagring

**2.1 Oppdater contracts.ts med utvidet datamodell**

Fil: `src/services/contracts.ts`

```text
Nye typer:
- LocalUser: id, name, avatarColor
- Thread: id, title, participantIds
- Message: id, threadId, senderId, senderName, text, createdAt, 
           editedAt?, deletedAt?, status, attachments[], reactions{}
- Attachment: id, type (image|gif|video), url, thumbUrl?
- MessageStatus: 'sent' | 'delivered' | 'seen'
```

**2.2 Opprett chat.local.ts med localStorage/IndexedDB**

Ny fil: `src/services/chat.local.ts`

Implementerer:
- `getThread()` - returnerer default Davos crew thread
- `listMessages(threadId)` - henter meldinger fra localStorage
- `sendMessage(threadId, payload)` - lagrer ny melding
- `editMessage(messageId, newText)` - setter editedAt
- `deleteMessage(messageId)` - setter deletedAt (soft delete)
- `toggleReaction(messageId, emoji)` - legg til/fjern reaksjon
- `updateMessageStatus(messageId, status)` - oppdater status

**2.3 IndexedDB wrapper for media**

Ny fil: `src/services/media-storage.ts`

- Lagrer Blob-data for bilder/video
- Fallback til blob URL hvis IndexedDB feiler
- Metoder: `saveMedia(id, blob)`, `getMedia(id)`, `deleteMedia(id)`

**2.4 Brukeridentitet**

Ny fil: `src/hooks/useCurrentUser.ts`

- Genererer userId med crypto.randomUUID()
- Lagrer i localStorage
- Default name = "Meg"
- Funksjon for å endre visningsnavn

### Fase 3: Chat UI-komponenter

Ny mappe: `src/components/chat/`

**3.1 ChatMessageList.tsx**
- ScrollArea-basert liste
- Gruppering av meldinger fra samme avsender
- Autoscroll til bunn ved ny melding
- "Hopp til bunn"-knapp hvis bruker har scrollet opp
- IntersectionObserver for "sett"-status

**3.2 ChatMessageBubble.tsx**
- Egen melding (høyre, accent-bakgrunn) vs andres (venstre, muted)
- Viser avsendernavn for andres meldinger
- Status-ikoner: sendt/levert/sett (kun egne)
- "Redigert"-label hvis editedAt finnes
- "Melding slettet"-state hvis deletedAt finnes
- Timestamp som vises ved tap
- Attachments (bilde/video/GIF thumbnail)
- Reaksjoner under boblen som chips

**3.3 DateSeparator.tsx**
- "I dag", "I går", eller "dd.mm.yyyy"
- Sentrert linje med dato

**3.4 ChatComposer.tsx**
- Textarea med auto-resize
- Enter = send, Shift+Enter = ny linje
- Knapper: Emoji, GIF, Vedlegg (+), Send
- Preview av valgt media før sending
- Fil-input (accept="image/*,video/*")

**3.5 EmojiPicker.tsx**
- Popover med ofte brukte emojis
- Grid-layout, gruppert etter kategori
- Ingen ekstern dependency - hardkodet emoji-liste

**3.6 GifPicker.tsx**
- Sheet (bottom drawer) med søkefelt
- Grid av GIF-resultater fra Giphy API
- Krever VITE_GIPHY_API_KEY (må legges til i secrets)
- Fallback-melding hvis nøkkel mangler

**3.7 ReactionBar.tsx**
- Hurtigreaksjoner: thumbs up, heart, laugh, wow, sad, angry, plus
- Vises ved long-press/høyreklikk på melding
- Animert inn/ut

**3.8 MessageActionsMenu.tsx**
- ContextMenu (desktop) / Long-press popover (mobil)
- Egne meldinger: Rediger, Slett, Kopier
- Andres meldinger: Reager, Kopier
- Bruker eksisterende DropdownMenu/ContextMenu

**3.9 MediaViewerModal.tsx**
- Dialog for fullskjerm visning av bilde/video
- Object-contain for bilder
- Video-player for video
- Enkel zoom (+/-) for bilder

**3.10 TypingIndicator.tsx**
- Animert "..."-boble
- Vises nær bunnen av meldingslisten
- Simulert: trigges etter bruker har skrevet i 600ms

### Fase 4: Interaksjoner og UX

**4.1 Long-press håndtering**

Ny hook: `src/hooks/useLongPress.ts`
- Pointer events for touch/desktop
- 500ms delay for å aktivere
- Trigge ReactionBar + MessageActionsMenu

**4.2 Timestamp toggle**
- State for å vise/skjule timestamps globalt
- Tap på hvilken som helst melding toggler

**4.3 Auto-scroll logikk**
- Scroll til bunn ved ny melding
- Detekter om bruker har scrollet opp (via scroll-event)
- Vis "Hopp til bunn"-knapp (floating action button)

**4.4 Meldingsstatus-simulering**
- "Sendt" umiddelbart
- "Levert" etter 300ms timeout
- "Sett" via IntersectionObserver når synlig i viewport

**4.5 Typing-indicator simulering**
- Debounce brukerens typing (600ms)
- Vis "Davos crew skriver..." i 2-3 sekunder
- Valgfritt: auto-reply med forhåndsdefinert melding

### Fase 5: Tom-tilstand og discoverability

**5.1 Oppdatert EmptyState**
- Ikon og tekst som forklarer funksjonalitet
- "Send tekst, emoji, GIF, bilde og video"
- "Hold inne en melding for reaksjoner og meny"

**5.2 Onboarding tooltip (valgfritt)**
- Første gangs bruk: liten toast som forklarer long-press
- Lagres i localStorage at den er vist

**5.3 Endre navn i header**
- Knapp i AppHeader (tannhjul eller profil-ikon)
- Åpner Dialog for å skrive inn nytt navn

## Filstruktur etter Sprint 2.0

```text
src/
  components/
    chat/
      ChatMessageList.tsx
      ChatMessageBubble.tsx
      ChatComposer.tsx
      DateSeparator.tsx
      EmojiPicker.tsx
      GifPicker.tsx
      ReactionBar.tsx
      MessageActionsMenu.tsx
      MediaViewerModal.tsx
      TypingIndicator.tsx
      index.ts
  hooks/
    useCurrentUser.ts
    useLongPress.ts
  services/
    chat.local.ts
    media-storage.ts
    contracts.ts (oppdatert)
  pages/
    ChatScreen.tsx (fullstendig refaktorert)
  components/layout/
    AppLayout.tsx (forenklet)
```

## Tekniske detaljer

### Datalagring
- **localStorage**: Meldinger (JSON), bruker-ID, visningsnavn, thread-metadata
- **IndexedDB**: Media-blobs (bilder, video) - unngår 5MB localStorage-limit
- **Fallback**: Blob URLs for media hvis IndexedDB feiler (ikke persistent)

### Keyboard-håndtering
- `Enter` sender melding
- `Shift+Enter` ny linje
- Escape lukker emoji/GIF picker

### Safe area
- Header: `safe-area-top` (allerede implementert)
- Composer: `bottom: calc(4rem + env(safe-area-inset-bottom))`
- Meldingsliste: padding-bottom for å ikke bli skjult av composer

### Giphy-integrasjon
- Krever VITE_GIPHY_API_KEY i miljøvariabler
- Endpoint: `api.giphy.com/v1/gifs/search`
- Viser feilmelding hvis nøkkel mangler

## Avhengigheter

Ingen nye dependencies. Bruker eksisterende:
- Radix UI (Dialog, Sheet, Popover, ContextMenu, ScrollArea)
- Lucide icons
- class-variance-authority
- date-fns for datoformatering

## Akseptansekriterier

- [ ] `/` (Chat) er fullverdig chat med alle features
- [ ] Sticky header + sticky composer, kun message-list scroller
- [ ] Timestamps + dato-separatorer fungerer
- [ ] Rediger/slett/reager fungerer
- [ ] Emoji-picker fungerer
- [ ] GIF-picker fungerer (med Giphy-nøkkel)
- [ ] Bilde + video-opplasting fungerer
- [ ] Typing-indikator (...) vises (lokal/simulert)
- [ ] Status (sendt/levert/sett) vises for egne meldinger
- [ ] Endringene i AppLayout ødelegger ikke øvrige tabs
- [ ] Design følger Davos-tokens

## Estimat

5-8 implementasjonsrunder fordelt på fasene.

## Forberedelse før implementasjon

For GIF-funksjonalitet må du legge til `VITE_GIPHY_API_KEY` som en secret i prosjektet. Du kan få en gratis nøkkel på developers.giphy.com.

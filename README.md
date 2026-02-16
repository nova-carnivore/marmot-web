# 🦫 Marmot Web

[![CI](https://github.com/nova-carnivore/marmot-web/actions/workflows/ci.yml/badge.svg)](https://github.com/nova-carnivore/marmot-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

A modern, Telegram Web-style messaging client for the [Marmot Protocol](https://github.com/marmot-protocol/marmot) — secure, decentralized group messaging combining MLS (RFC 9420) with Nostr.

Built as a **reference implementation** showcasing the [marmot-ts](https://github.com/nova-carnivore/marmot-ts) library.

> **⚠️ Status: Work In Progress — Not Production Ready**
>
> This client demonstrates Marmot Protocol concepts but **cannot fully interoperate with [MDK](https://github.com/marmot-protocol/mdk) / [marmot-cli](https://github.com/marmot-protocol/mdk) (the Rust reference implementation).**
>
> **What works:**
> - ✅ Login via NIP-07 or NIP-46
> - ✅ Contact loading, KeyPackage publishing, relay management
> - ✅ Receiving Welcome events from MDK → joining MLS groups → parsing v2 group data
> - ✅ All browser crypto (Ed25519, X25519, SHA-256, HKDF — patched via Vite plugin for WebCrypto)
> - ✅ NIP-59 gift wrapping for Welcome events
> - ✅ Encrypted media upload (MIP-04, Blossom)
>
> **What doesn't work:**
> - ❌ **Creating groups that MDK users can join** — MDK rejects KeyPackages from this client with `"The capabilities of the add proposal are insufficient for this group"`
> - ❌ **Sending messages that MDK can decrypt** — Welcome encoding incompatibility prevents full bidirectional messaging
> - ❌ **Receiving and decrypting kind:445 group messages** — subscription and decryption flow not yet implemented
>
> **Root cause:**
> The MLS layer ([ts-mls](https://github.com/LukaJCB/ts-mls)) has encoding incompatibilities with [OpenMLS](https://github.com/openmls/openmls) (used by MDK). In browser contexts, ts-mls drops the `0xf2ee` (marmot_group_data) extension from KeyPackage capabilities during serialization — despite the source code correctly specifying it. This is a ts-mls bug, not a marmot-web or marmot-ts issue. See [marmot-ts README](https://github.com/nova-carnivore/marmot-ts#readme) for full details.
>
> **Workaround:** Groups must be created from the MDK/marmot-cli side. marmot-web can join these groups and (once kind:445 subscription is implemented) participate in conversations.

## ✨ Features

- 🔐 **NIP-07 + NIP-46 Authentication** — Browser extension or remote signer
- 👥 **Contact Management** — Load following list with profiles & KeyPackage status
- 💬 **Real-time Messaging** — WebSocket relay connections, live message delivery
- 🔑 **KeyPackage Management** — Publish, view, delete KeyPackages (kind:443)
- 📎 **MIP-04 Encrypted Media** — ChaCha20-Poly1305 file encryption with imeta tags
- 🏗️ **Group Management** — Create groups, add/remove members, admin controls
- 🔍 **Search** — Search contacts and message history
- 🌙 **Dark Mode** — DaisyUI theme support
- 📱 **Responsive** — Desktop-first with mobile support

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ 
- [marmot-ts](https://github.com/nova-carnivore/marmot-ts) cloned at `../marmot-ts`

### Setup

```bash
# Clone marmot-ts (if not already)
git clone https://github.com/nova-carnivore/marmot-ts ../marmot-ts
cd ../marmot-ts && npm install && npm run build && cd -

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and connect with your Nostr browser extension.

## 🏗️ Architecture

```
marmot-web/
├── src/
│   ├── main.ts              # Entry point
│   ├── App.vue              # Root component
│   ├── router.ts            # Vue Router (Login, Chat, Settings)
│   ├── pages/               # Page components
│   │   ├── Login.vue        # NIP-07 / NIP-46 authentication
│   │   ├── Chat.vue         # Main two-column chat layout
│   │   └── Settings.vue     # KeyPackage & relay management
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ConversationList.vue   # Sidebar conversation list
│   │   │   ├── MessageThread.vue      # Scrollable message display
│   │   │   ├── MessageComposer.vue    # Text input + file attachment
│   │   │   └── MediaPreview.vue       # Image/video/file previews
│   │   ├── contacts/
│   │   │   ├── ContactList.vue        # Following list with search
│   │   │   ├── ContactCard.vue        # Contact with KeyPackage status
│   │   │   └── ContactSearch.vue      # Global search
│   │   └── common/
│   │       ├── Avatar.vue             # User avatar with fallback
│   │       └── SearchBar.vue          # Reusable search input
│   ├── composables/
│   │   ├── useNostr.ts       # Relay connections, subscriptions
│   │   ├── useMarmot.ts      # Group creation, messaging
│   │   ├── useKeyPackages.ts # KeyPackage CRUD
│   │   ├── useProfile.ts     # Profile loading
│   │   └── useMedia.ts       # MIP-04 media encryption
│   ├── stores/               # Pinia stores (immutable pattern)
│   │   ├── auth.ts           # Authentication state
│   │   ├── contacts.ts       # Following list
│   │   ├── conversations.ts  # Chat threads
│   │   ├── messages.ts       # Message history
│   │   ├── profiles.ts       # Profile cache
│   │   ├── keyPackages.ts    # KeyPackage tracking
│   │   └── relays.ts         # Relay connections
│   ├── types/                # TypeScript types
│   └── utils/                # Helper functions
├── tests/
│   ├── unit/                 # Vitest unit tests (71 tests)
│   ├── integration/          # Protocol integration tests
│   └── e2e/                  # Playwright E2E tests
└── .github/workflows/ci.yml  # CI: lint, typecheck, test, build, e2e
```

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Vue 3 (Composition API, `<script setup>`) |
| **Language** | TypeScript (strict mode) |
| **Build** | Vite 6 |
| **Styling** | Tailwind CSS 4 + DaisyUI 5 |
| **State** | Pinia + Immer (immutable pattern) |
| **Protocol** | marmot-ts (MIP-00 through MIP-04) |
| **Nostr** | nostr-tools (SimplePool, subscriptions) |
| **Testing** | Vitest + Playwright |
| **Linting** | ESLint + Prettier |

## 📡 Protocol Integration

### marmot-ts Usage

The client integrates all MIP implementations from marmot-ts:

```typescript
// MIP-00: KeyPackage management
import { createKeyPackageEvent, parseKeyPackageEvent } from 'marmot-ts/mip00'

// MIP-01: Group creation  
import { createGroupData, getNostrGroupIdHex } from 'marmot-ts/mip01'

// MIP-02: Welcome events
import { createWelcomeRumor, giftWrapWelcome } from 'marmot-ts/mip02'

// MIP-03: Group messaging
import {
  createGroupEvent,
  createApplicationMessage,
  serializeApplicationMessage,
} from 'marmot-ts/mip03'

// MIP-04: Encrypted media
import { encryptMedia, decryptMedia, buildImetaTag } from 'marmot-ts/mip04'
```

### Message Flow

```
User types message
  → createApplicationMessage() (unsigned inner event)
  → serializeApplicationMessage() (JSON)
  → MLS encrypt (via ts-mls)
  → NIP-44 encrypt (exporter secret)
  → createGroupEvent() (kind:445, ephemeral keypair)
  → Publish to relays
```

### Nostr Event Kinds

| Kind | Purpose |
|------|---------|
| 0 | Profile metadata |
| 3 | Contact list (following) |
| 443 | MLS KeyPackages |
| 444 | Welcome events (NIP-59 gift-wrapped) |
| 445 | Group events (messages, commits) |
| 10002 | Relay list |
| 10051 | KeyPackage relay list |

## 🧪 Testing

```bash
# Run all unit + integration tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests (requires build first)
npm run build
npm run test:e2e
```

### Test Summary

- **71 unit/integration tests** across 8 test files
- **4 E2E tests** (login flow with NIP-07 mock)
- Store tests: auth, messages, conversations, profiles, keyPackages
- Protocol integration: KeyPackage lifecycle, group creation, application messages, media encryption/decryption
- Utility tests: npub conversion, timestamps, file size formatting

## 📋 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check |
| `npm test` | Run all tests |
| `npm run test:e2e` | Run Playwright E2E tests |

## 🔒 Security

- **No private keys in browser** — Uses NIP-07 extension or NIP-46 remote signer
- **Unsigned inner events** — Application messages are never signed (prevents leak publication)
- **Ephemeral keypairs** — Fresh keypair for every kind:445 event
- **MIP-04 encryption** — ChaCha20-Poly1305 with HKDF-derived keys
- **NIP-59 gift wrapping** — Welcome events are encrypted end-to-end
- **Credential validation** — MLS identity must match Nostr pubkey

## 🤝 Related Projects

- [Marmot Protocol Spec](https://github.com/marmot-protocol/marmot) — Protocol specification
- [marmot-ts](https://github.com/nova-carnivore/marmot-ts) — TypeScript library (this client's foundation)
- [MDK](https://github.com/marmot-protocol/mdk) — Rust implementation
- [ts-mls](https://github.com/LukaJCB/ts-mls) — Pure TypeScript MLS (RFC 9420)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) — Nostr client library

## 📄 License

[MIT](./LICENSE)

---

Built with 🦫 by [Nova Carnivore](https://github.com/nova-carnivore)

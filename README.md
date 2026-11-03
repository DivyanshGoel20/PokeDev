# PokeDev

Gotta catch every builder. A mobile web game for Devcon: meet someone, point your camera at them, swipe a DevBall and their builder card lands in your collection.

## How it works

1. **Join**: username + passcode, a builder card (name, type, what you're building, socials) and a 3-second face scan.
2. **Catch** (`/play`): live camera with face tracking. Swipe the ball at a glowing face. The face is matched against registered players; on a match their card is added to your PokeDev.
3. **PokeDev** (`/dex`), **Ranks** (`/leaderboard`) and **Me** (`/me`: edit card, hide mode, rescan, delete account).

## Privacy

- Only registered players can be caught. Faces of anyone else are compared, then discarded.
- No photos are uploaded or stored. The browser turns a face into a 128-number descriptor ([face-api](https://github.com/vladmandic/face-api)); only that is sent and saved.
- One face per account (prevents catching yourself with a second account).
- Hide mode and one-tap account deletion (removes profile, face data and every catch).

## Stack

- Next.js 15 (App Router), deployed on Vercel
- Postgres (Neon) via `DATABASE_URL`; face distance is computed in plain SQL, no extensions needed
- Local dev without a database URL uses an embedded Postgres (PGlite) stored in `./.pglite`
- Face detection/recognition in the browser with `@vladmandic/face-api` (models in `public/models`)

## Develop

```bash
npm install
npm run dev
```

The camera needs HTTPS on phones. `localhost` works on the same machine; to test on a phone, deploy a preview to Vercel.

## Matching

Face descriptors are compared with euclidean distance. A catch needs distance below `MATCH_THRESHOLD` (0.45) and the runner-up must be at least `MATCH_MARGIN` (0.06) further away, otherwise the player is asked for a closer look. Both are in `src/lib/types.ts`.

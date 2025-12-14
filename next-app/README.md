# Chameleon / Imposter - Next.js + Supabase

A real-time multiplayer social deduction game built with Next.js and Supabase. Players take on roles as either regular players or a chameleon, working together to identify the imposter or to help them blend in.

## Features

- **Real-time multiplayer** - Play across multiple browser tabs or devices with instant synchronization
- **Custom categories** - Choose from pre-built categories (Animals, Food, Places, Objects) or create custom word lists
- **Session persistence** - Automatically rejoin a room after page refresh
- **Presence tracking** - See active players with periodic heartbeat and stale-player filtering
- **Cross-tab support** - Test multiplayer locally using multiple browser tabs with ephemeral IDs
- **Responsive UI** - Clean, modern interface with app-native modal dialogs

## Quick Start

### 1. Set up Supabase

1. Create a Supabase project at [https://app.supabase.com](https://app.supabase.com)
2. Note your **Project URL** and **Anon Key**
3. Create the required tables:

   **`players` table:**
   ```sql
   CREATE TABLE IF NOT EXISTS public.players (
     id uuid PRIMARY KEY,
     room text NOT NULL,
     name text NOT NULL,
     lastSeen timestamptz DEFAULT now()
   );
   CREATE INDEX players_room_idx ON public.players (room);
   ALTER TABLE public.players DISABLE ROW LEVEL SECURITY;
   ```

   **`rooms` table:**
   ```sql
   CREATE TABLE IF NOT EXISTS public.rooms (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     room text UNIQUE NOT NULL,
     payload jsonb,
     updated_at timestamptz DEFAULT now()
   );
   ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
   ```

4. Enable Realtime on both tables (go to **Replication** settings in Supabase dashboard)

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install & Run

```bash
cd next-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create or join a room!

## How to Play

1. **Join a room** - Enter a room name and your player name
2. **Choose a category** - Select one of the preset categories or create a custom word list
3. **Start the game** - The app will randomly assign one player as the Chameleon
4. **Regular players** see the secret word; the **Chameleon** must guess it by blending in with their answers
5. After discussion, vote to identify (or protect) the Chameleon!

## Multi-Tab Testing

Enable **"Multi-tab mode (ephemeral)"** to generate a unique player ID for each tab, allowing you to test the game locally with multiple players.

## Architecture

- **Frontend**: Next.js (App Router) with React hooks
- **State Sync**: Supabase Realtime channels + BroadcastChannel API for cross-tab communication
- **Presence**: Heartbeat-based `players` table with stale-player filtering
- **Session Restore**: Auto-rejoin on page refresh using localStorage
- **Modals**: Custom app-native confirmation/alert dialogs with keyboard accessibility (Escape/Enter)

## Development

- **Hot reload** with session restoration - develop without losing your player state
- **Debug logs** minimized for production cleanliness
- **Keyboard shortcuts** in modals for accessibility
- **Error fallbacks** - graceful degradation to local-only mode if DB write fails

## Maintenance scripts

A small helper is provided to prune stale `players` rows (useful if you want
to remove disconnected players periodically).

Usage:

```bash
# export SUPABASE_SERVICE_KEY (service_role key) and SUPABASE_URL
cd next-app
SUPABASE_SERVICE_KEY=your_service_key SUPABASE_URL=https://your.supabase.url node scripts/prune.js
```

You can schedule this via a cron job, GitHub Actions, or a Supabase Edge Function.

## Future Enhancements

- [ ] Voting phase with tally display
- [ ] Game timer and round management
- [ ] Player statistics and leaderboards
- [ ] Voice/video integration via Twilio or Agora
- [ ] Mobile app (React Native)

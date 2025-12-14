# Chameleon / Imposter - Real-Time Multiplayer Game

A real-time multiplayer social deduction game built with **Next.js** and **Supabase**. Perfect for game nights with friends!

## 🎮 Game Overview

Players take on roles as either regular players or a chameleon (the imposter). The challenge is to identify the chameleon while they try to blend in by guessing the secret word based on other players' clues.

## ✨ Features

- ✅ **Real-time multiplayer** - Play with friends across multiple tabs or devices
- ✅ **Custom categories** - Create your own word lists or choose from built-in categories
- ✅ **Session persistence** - Auto-rejoin after page refresh
- ✅ **Presence tracking** - See active players with heartbeat monitoring
- ✅ **Cross-tab support** - Test multiplayer locally in a single browser
- ✅ **Modern UI** - Responsive design with app-native modals
- ✅ **Keyboard accessible** - Full keyboard support (Escape/Enter in modals)

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- A Supabase account ([https://app.supabase.com](https://app.supabase.com))

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/chameleon.git
cd chameleon
npm run install-deps
```

### 2. Set Up Supabase

Create a new Supabase project and run the SQL setup:

**`players` table** (for presence tracking):
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

**`rooms` table** (for game state):
```sql
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text UNIQUE NOT NULL,
  payload jsonb,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
```

Enable **Realtime** on both tables in the Supabase dashboard.

### 3. Configure Environment

Create `next-app/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enjoy!

## 🎯 How to Play

1. **Enter room & name** - Join a game room
2. **Choose a category** - Pick from Animals, Food, Places, Objects, or create custom words
3. **Start game** - One player is randomly selected as the Chameleon
4. **Regular players** see the secret word; **Chameleon** must guess it
5. **Discussion phase** - All players give clues (keep it vague!)
6. **Vote** - Vote to identify or protect the Chameleon

## 🧪 Local Testing

Enable **"Multi-tab mode (ephemeral)"** to generate unique player IDs per tab. Open multiple tabs to simulate multiple players!

## 📁 Project Structure

```
chameleon/
├── next-app/                    # Main Next.js application
│   ├── app/
│   │   ├── page.js             # Main game component
│   │   ├── layout.js           # App layout
│   │   └── globals.css         # Styling & design tokens
│   ├── lib/
│   │   └── supabaseClient.js   # Supabase client setup
│   ├── db/
│   │   └── init_players.sql    # Database initialization
│   ├── package.json
│   └── README.md               # Detailed setup guide
├── package.json                # Root scripts
└── README.md                   # This file
```

## 🏗️ Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) + React | UI & game logic |
| **Sync** | Supabase Realtime + BroadcastChannel | Real-time state sync |
| **Presence** | Heartbeat + `players` table | Track active players |
| **State** | `rooms` table (JSONB) | Game room configuration |

## 🔄 State Sync Flow

1. Player joins → upsert to `players` table
2. Realtime channel broadcasts changes to all clients
3. BroadcastChannel syncs across browser tabs
4. Polling fallback (3-5s) ensures reliability
5. Heartbeat (15s) keeps `lastSeen` updated
6. Stale players filtered automatically

## 🎛️ Configuration

Tweak these constants in `next-app/app/page.js`:

```javascript
const HEARTBEAT_INTERVAL = 15000  // ms between presence updates
const STALE_THRESHOLD = 60000     // ms before marking player stale
```

## 🛠️ Development

```bash
# Dev server with hot reload (keeps session across reloads)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📝 License

MIT

## 🤝 Contributing

Feel free to open issues and PRs! Contributions welcome.

## 🗺️ Roadmap

- [ ] Voting phase with tally
- [ ] Timer for rounds
- [ ] Statistics & leaderboard
- [ ] Voice/video integration
- [ ] Mobile app (React Native)
- [ ] Deploy templates (Vercel, Railway)

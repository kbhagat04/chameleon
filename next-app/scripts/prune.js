#!/usr/bin/env node
// Prune stale players from the `players` table.
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables, then:
//   node scripts/prune.js

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const TTL_MINUTES = Number(process.env.PLAYER_TTL_MINUTES || '2')

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

async function prune() {
  const threshold = new Date(Date.now() - TTL_MINUTES * 60 * 1000).toISOString()
  console.log('Pruning players with lastSeen <', threshold)
  const { data, error } = await supabase.from('players').delete().lt('lastSeen', threshold).select()
  if (error) {
    console.error('Prune failed:', error)
    process.exit(1)
  }
  console.log('Pruned rows:', (data || []).length)
}

prune().catch((err) => { console.error(err); process.exit(1) })

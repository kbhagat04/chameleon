'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { checkSupabase } from '../lib/supabaseClient'

// Theme key used in localStorage
const THEME_KEY = 'chameleon_dark'

export default function Home() {
  // Avoid accessing localStorage during SSR — initialize to a safe default
  const [room, setRoom] = useState('main')
  const [name, setName] = useState('')
  const [ephemeral, setEphemeral] = useState(false)
  const [players, setPlayers] = useState([])
  const [joined, setJoined] = useState(false)
  const [role, setRole] = useState(null)
  const [secretWord, setSecretWord] = useState(null)
  const [category, setCategory] = useState(null)
  const [customWords, setCustomWords] = useState([])
  const [customInput, setCustomInput] = useState('')
  const [showCustomCat, setShowCustomCat] = useState(false)
  // modal state (supports both confirm and alert modes)
  const [confirmState, setConfirmState] = useState({ open: false, message: '', type: 'confirm', okLabel: 'OK', cancelLabel: 'Cancel' })
  const confirmResolveRef = useRef(null)
  const primaryBtnRef = useRef(null)

  const showConfirm = (message, okLabel = 'Delete', cancelLabel = 'Cancel') => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
      setConfirmState({ open: true, message, type: 'confirm', okLabel, cancelLabel })
    })
  }

  const showAlert = (message, okLabel = 'OK') => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
      setConfirmState({ open: true, message, type: 'alert', okLabel })
    })
  }

  const handleConfirm = (choice) => {
    setConfirmState({ open: false, message: '', type: 'confirm', okLabel: 'OK', cancelLabel: 'Cancel' })
    if (confirmResolveRef.current) {
      confirmResolveRef.current(choice)
      confirmResolveRef.current = null
    }
  }

  // keyboard accessibility & focus management for modal
  useEffect(() => {
    if (!confirmState.open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (confirmState.type === 'confirm') handleConfirm(false)
        else handleConfirm(true)
      }
      if (e.key === 'Enter') {
        handleConfirm(true)
      }
    }
    try { primaryBtnRef.current && primaryBtnRef.current.focus() } catch (e) {}
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmState.open])
  const HEARTBEAT_INTERVAL = 15000 // 15s
  const STALE_THRESHOLD = 60000 // 60s
  const heartbeatRef = useRef(null)
  const myIdRef = useRef(null)
  const myJoinedAtRef = useRef(null)
  const lastHandledStartRef = useRef(0)
  const [localPresence, setLocalPresence] = useState(false)
  const localPresenceRef = useRef(false)
  const [dark, setDark] = useState(false)

  const normalizeRoom = (r) => (r || '').toString().trim().toLowerCase()
  const fetchPlayersRef = useRef(null)
  const fetchRoomRef = useRef(null)

  // shared function to fetch players for a room (used by realtime, polling, and BroadcastChannel)
  const fetchPlayersForRoom = async (roomName) => {
    const normalized = normalizeRoom(roomName)
    try {
      const { data } = await supabase.from('players').select('*').eq('room', normalized)
      // filter out stale rows based on lastSeen to avoid showing disconnected tabs
      const now = Date.now()
      const filtered = (data || []).filter((r) => {
        if (!r.lastSeen) return true // keep if no timestamp (back-compat)
        const last = new Date(r.lastSeen).getTime()
        return (now - last) <= STALE_THRESHOLD
      })
      setPlayers(filtered.map((r) => ({ id: r.id, name: r.name, lastSeen: r.lastSeen })))
    } catch (e) {
      console.error('fetchPlayersForRoom error', e)
    }
  }
  fetchPlayersRef.current = fetchPlayersForRoom
  fetchPlayersRef.current = fetchPlayersForRoom

  // BroadcastChannel to sync room/id across tabs (if supported)
  const setupBroadcast = () => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null
    try {
      const bc = new BroadcastChannel('chameleon-sync')
      bc.onmessage = (ev) => {
        const { type, payload } = ev.data || {}
        if (type === 'room-canonical' && payload?.room) {
          // set canonical room locally (join uses this) but don't fetch payload
          setRoom(payload.room)
          try { localStorage.setItem('chameleon_room', payload.room) } catch (e) {}
        }
        if (type === 'room-updated' && payload?.room) {
          // update canonical room and fetch authoritative room payload (overwrite category)
          setRoom(payload.room)
          try { localStorage.setItem('chameleon_room', payload.room) } catch (e) {}
          try { fetchRoomRef.current && fetchRoomRef.current(normalizeRoom(payload.room), true) } catch (e) {}
        }
        if (type === 'player-id' && payload?.id) {
          try { localStorage.setItem('chameleon_player_id', payload.id) } catch (e) {}
        }
        if (type === 'player-joined' && payload?.id) {
            // fetch authoritative list from DB when a join happens
            try { fetchPlayersRef.current && fetchPlayersRef.current(normalizeRoom(room)) } catch (e) {}
        }
        if (type === 'player-left' && payload?.id) {
            // fetch authoritative list from DB when a leave happens
            try { fetchPlayersRef.current && fetchPlayersRef.current(normalizeRoom(room)) } catch (e) {}
        }
        if (type === 'room-cleared' && payload?.room) {
          try {
            const canonical = normalizeRoom(payload.room)
            if (normalizeRoom(room) === canonical) {
              try { showAlert('Room was cleared. Returning to the home screen.') } catch (e) {}
              try { leaveRoom() } catch (e) {}
            }
          } catch (e) {}
        }
      }
      return bc
    } catch (e) {
      return null
    }
  }

  // Fetch room payload for a room. If `overwriteCategory` is true, always set local category
  // to the room payload's category; otherwise only set it if local category is null (avoid auto-overwrite on join).
  const fetchRoomFor = async (roomName, overwriteCategory = false) => {
    const normalized = normalizeRoom(roomName)
    try {
      const { data } = await supabase.from('rooms').select('payload').eq('room', normalized).limit(1).single()
      const payload = data?.payload || null
      if (!payload) return
      if (overwriteCategory) {
        try { setCategory(payload.category || null) } catch (e) {}
      } else {
        try { setCategory((prev) => (prev === null ? (payload.category || null) : prev)) } catch (e) {}
      }
      // Always sync customWords when category is Custom
      if (payload.category === 'Custom' && Array.isArray(payload.customWords)) {
        setCustomWords(payload.customWords)
      }
      const payloadPlayers = Array.isArray(payload.players) ? payload.players : []
      const payloadStarted = Number(payload.startedAt) || 0
      if (payloadStarted && payloadStarted > lastHandledStartRef.current) {
        lastHandledStartRef.current = payloadStarted
        const myId = myIdRef.current || (() => { try { return localStorage.getItem('chameleon_player_id') } catch (e) { return null } })()
        const joinedAt = myJoinedAtRef.current || 0
        if (myId && joinedAt && joinedAt <= payloadStarted) {
          const included = payloadPlayers.some((p) => p.id === myId)
          if (included) {
            const amChameleon = payload.chameleon === myId
            setRole(amChameleon ? 'Chameleon' : 'Player')
            // For custom, always use payload.customWords for word selection
            if (payload.category === 'Custom') {
              setSecretWord(amChameleon ? null : (payload.secretWord || ''))
              setCustomWords(Array.isArray(payload.customWords) ? payload.customWords : [])
            } else {
              setSecretWord(amChameleon ? null : payload.secretWord)
            }
          }
        }
      }
    } catch (e) {
      console.error('fetchRoomFor error', e)
    }
  }
  fetchRoomRef.current = fetchRoomFor

  // On mount: load persisted room/player id and set up BroadcastChannel once
  useEffect(() => {
    if (typeof window === 'undefined') return
    // initialize dark mode from localStorage
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'true') {
        setDark(true)
        try { document.documentElement.setAttribute('data-theme', 'dark') } catch (e) {}
      }
    } catch (e) {}
    try {
      const storedRoom = localStorage.getItem('chameleon_room')
      if (storedRoom) setRoom(storedRoom)
    } catch (e) {
      // ignore localStorage errors
    }

    // restore persisted player id into myIdRef for role resolution after reload
    try {
      const storedId = localStorage.getItem('chameleon_player_id')
      if (storedId) myIdRef.current = storedId
    } catch (e) {}

    const bc = setupBroadcast()
    return () => {
      try { bc?.close() } catch (e) {}
    }
  }, [])

  // toggle dark mode and persist choice
  const toggleDark = () => {
    try {
      const next = !dark
      setDark(next)
      if (next) document.documentElement.setAttribute('data-theme', 'dark')
      else document.documentElement.removeAttribute('data-theme')
      try { localStorage.setItem(THEME_KEY, next ? 'true' : 'false') } catch (e) {}
    } catch (e) { console.error('toggleDark error', e) }
  }

  // Simple in-room presence implemented via a rooms record with payload
  // Presence is now implemented using a dedicated `players` table.
  // Subscribe to realtime changes on `players` for the normalized room
  useEffect(() => {
    if (!joined) return

    const normalizedRoom = normalizeRoom(room)

    // initial fetch
    fetchPlayersForRoom(normalizedRoom)

    const channel = supabase.channel(`public:players:${normalizedRoom}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room=eq.${normalizedRoom}` }, async (payload) => {
        // refresh authoritative list from DB
        await fetchPlayersForRoom(normalizedRoom)
      })
      .subscribe()

    // fallback polling in case realtime events aren't delivered to all tabs
    const pollInterval = 3000
    const pollRef = setInterval(() => {
      fetchPlayersForRoom(normalizedRoom)
    }, pollInterval)

    // Subscribe to realtime changes on `rooms` for the normalized room
    const roomChannel = supabase.channel(`public:rooms:${normalizedRoom}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `room=eq.${normalizedRoom}` }, async (payload) => {
        // Always fetch and overwrite category/game state
        await fetchRoomRef.current && fetchRoomRef.current(normalizedRoom, true)
      })
      .subscribe()

    // polling fallback for room payloads (still keep for reliability)
    const roomPollInterval = 2000
    const roomPollRef = setInterval(() => {
      fetchRoomRef.current && fetchRoomRef.current(normalizedRoom, true)
    }, roomPollInterval)

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(roomChannel)
      try { clearInterval(pollRef) } catch (e) {}
      try { clearInterval(roomPollRef) } catch (e) {}
    }
  }, [joined, room])

  // cleanup heartbeat and beforeunload listener on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      try { window.removeEventListener('beforeunload', window._chameleon_remove_self) } catch (e) {}
    }
  }, [])

  async function join() {
    if (!name) {
      await showAlert('Enter a name')
      return
    }
    // normalize the room key and persist it as the canonical room
    const normalizedRoom = normalizeRoom(room)
    // persist canonical room so refresh stays consistent
    localStorage.setItem('chameleon_room', normalizedRoom)
    // broadcast the canonical room and current player id to other tabs
    try {
      const bc = setupBroadcast()
      if (bc) {
        bc.postMessage({ type: 'room-canonical', payload: { room: normalizedRoom } })
      }
    } catch (e) {}
    setRoom(normalizedRoom)
    setJoined(true)
    const now = Date.now()
    myJoinedAtRef.current = now
    try { localStorage.setItem('chameleon_joined_at', String(now)) } catch (e) {}
    // create or reuse a stable id for this browser session
    let myId
    if (ephemeral) {
      // ephemeral mode: generate a fresh id for this tab only (don't persist)
      myId = crypto.randomUUID()
      myIdRef.current = myId
    } else {
      try {
        myId = localStorage.getItem('chameleon_player_id')
      } catch (e) {
        myId = null
      }
      if (!myId) {
        myId = crypto.randomUUID()
        try { localStorage.setItem('chameleon_player_id', myId) } catch (e) {}
      }
      myIdRef.current = myId
    }
    try { localStorage.setItem('chameleon_player_id', myId) } catch (e) {}
    try { localStorage.setItem('chameleon_name', name) } catch (e) {}

    const normalizedRoomKey = normalizedRoom

    // insert presence row into `players` table
    try {
      const nowISO = new Date().toISOString()
      const insRes = await supabase.from('players').upsert([{ id: myId, room: normalizedRoomKey, name }], { onConflict: 'id' }).select()
      if (insRes.error) {
        // Log the full response so we can diagnose empty error objects
        console.error('insert presence error - full response:', insRes)
        const e = insRes.error || {}
        console.error('insert presence error (fields):', {
          message: e.message,
          details: e.details,
          hint: e.hint,
          code: e.code,
        })
        // fall back to local-only presence so the UI remains usable
        localPresenceRef.current = true
        setLocalPresence(true)
        setPlayers([{ id: myId, name }])
        await showAlert('Presence write failed. Ensure `players` table exists and RLS allows writes. Falling back to local-only presence.')
      } else {
        localPresenceRef.current = false
        setLocalPresence(false)
        // notify other tabs immediately that a player joined
        try {
          const bc2 = setupBroadcast()
          if (bc2) bc2.postMessage({ type: 'player-joined', payload: { id: myId, name } })
        } catch (e) {}
        // sync rooms.payload.players to include the new player
        // no room payload sync here; `rooms` should only be updated by explicit game start
      }
    } catch (e) {
      console.error('presence insert failed', e)
      localPresenceRef.current = true
      setLocalPresence(true)
      setPlayers([{ id: myId, name }])
      await showAlert('Presence insert failed (exception). Falling back to local-only presence.')
    }

    // fetch current players for room and set state (filters stale rows)
    try {
      await fetchPlayersRef.current && fetchPlayersRef.current(normalizedRoomKey)
    } catch (e) {
      console.error('fetch players after join failed', e)
    }

    // start heartbeat to keep lastSeen updated (only if we successfully write presence)
    try {
      if (!localPresenceRef.current) {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
        heartbeatRef.current = setInterval(async () => {
          try {
            await supabase.from('players').upsert([{ id: myId, room: normalizedRoomKey, name, lastSeen: new Date().toISOString() }], { onConflict: 'id' })
          } catch (e) {
            console.error('heartbeat upsert failed', e)
          }
        }, HEARTBEAT_INTERVAL)
        // do an immediate heartbeat write as well
        try { await supabase.from('players').upsert([{ id: myId, room: normalizedRoomKey, name, lastSeen: new Date().toISOString() }], { onConflict: 'id' }) } catch (e) {}
      }
    } catch (e) {}

    // remove player on tab close/unload
    const removeSelf = async () => {
      try {
        // only remove remote presence if we actually wrote one (not local-only fallback)
        if (!localPresenceRef.current) {
          await supabase.from('players').delete().eq('id', myId)
        }
      } catch (e) {
        console.error('removeSelf error', e)
      }
    }

    // store the handler globally so cleanup effect can remove it
    window._chameleon_remove_self = removeSelf
    window.addEventListener('beforeunload', removeSelf)
  }

  // Attempt to restore a previous session on page load/refresh
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const storedId = localStorage.getItem('chameleon_player_id')
      const storedRoom = localStorage.getItem('chameleon_room')
      const storedName = localStorage.getItem('chameleon_name')
      const storedJoinedAt = localStorage.getItem('chameleon_joined_at')
      if (!storedId || !storedRoom) return
      // set refs/state so UI can rehydrate immediately
      myIdRef.current = storedId
      myJoinedAtRef.current = storedJoinedAt ? Number(storedJoinedAt) : Date.now()
      setRoom(storedRoom)
      if (storedName) setName(storedName)

      ;(async () => {
        try {
          // verify the players row exists for this id (helps when DB row already present)
          const { data: playerRow, error } = await supabase.from('players').select('*').eq('id', storedId).limit(1).single()
          if (error) {
            // if there's an error, just bail — user can re-join manually
            return
          }
          if (playerRow) {
            // mark joined and refresh room/player state
            setJoined(true)
            // refresh authoritative player list and room payload
            try { fetchPlayersRef.current && fetchPlayersRef.current(storedRoom) } catch (e) {}
            try { fetchRoomRef.current && fetchRoomRef.current(storedRoom, true) } catch (e) {}
            // ensure we have a beforeunload remover and upsert presence to refresh lastSeen
            const removeSelf = async () => {
              try {
                await supabase.from('players').delete().eq('id', storedId)
              } catch (e) {
                console.error('restore removeSelf error', e)
              }
            }
            window._chameleon_remove_self = removeSelf
            try { window.addEventListener('beforeunload', removeSelf) } catch (e) {}
            // upsert presence row to refresh lastSeen/name/room in DB
            try {
              await supabase.from('players').upsert([{ id: storedId, room: normalizeRoom(storedRoom), name: storedName || playerRow.name }], { onConflict: 'id' })
            } catch (e) {
              console.error('restore upsert presence failed', e)
            }
              // start heartbeat for restored session
              try {
                if (!localPresenceRef.current) {
                  if (heartbeatRef.current) clearInterval(heartbeatRef.current)
                  heartbeatRef.current = setInterval(async () => {
                    try {
                      await supabase.from('players').upsert([{ id: storedId, room: normalizeRoom(storedRoom), name: storedName || playerRow.name, lastSeen: new Date().toISOString() }], { onConflict: 'id' })
                    } catch (e) { console.error('restore heartbeat upsert failed', e) }
                  }, HEARTBEAT_INTERVAL)
                  try { await supabase.from('players').upsert([{ id: storedId, room: normalizeRoom(storedRoom), name: storedName || playerRow.name, lastSeen: new Date().toISOString() }], { onConflict: 'id' }) } catch (e) {}
                }
              } catch (e) {}
          }
        } catch (e) {
          console.error('session restore failed', e)
        }
      })()
    } catch (e) {}
  }, [])

  async function startGame() {
    if (!category) {
      await showAlert('Select a category before starting the game')
      return
    }
    if (players.length < 3) {
      await showAlert('At least 3 players required')
      return
    }

    // pick a chameleon and a secret word
    const chIndex = Math.floor(Math.random() * players.length)
    const chId = players[chIndex].id
    // fetch customWords from room payload if category is Custom
    let payloadCustomWords = customWords
    if (category === 'Custom') {
      try {
        const { data: roomRow } = await supabase.from('rooms').select('payload').eq('room', normalizeRoom(room)).limit(1).single()
        payloadCustomWords = roomRow?.payload?.customWords || customWords
      } catch (e) {}
    }
    const word = chooseWord(category, payloadCustomWords)

    // preserve any existing room-level settings (like category)
    const normalizedRoom = normalizeRoom(room)
    let existingPayload = {}
    try {
      const { data: roomRow } = await supabase.from('rooms').select('payload').eq('room', normalizedRoom).limit(1).single()
      existingPayload = roomRow?.payload || {}
    } catch (e) {
      // ignore - row may not exist yet
    }
    const payload = { ...existingPayload, players, chameleon: chId, secretWord: word, category: category || existingPayload.category || null, startedAt: Date.now() }
    if (category === 'Custom') payload.customWords = payloadCustomWords
    await supabase.from('rooms').upsert({ room: normalizedRoom, payload }, { onConflict: 'room' })

    // locally set role and secret for current player using stored id
    const myIdLocal = myIdRef.current || (() => { try { return localStorage.getItem('chameleon_player_id') } catch (e) { return null } })()
    const me = players.find((p) => p.id === myIdLocal) || players.find((p) => p.name === name)
    if (me) {
      setRole(me.id === chId ? 'Chameleon' : 'Player')
      setSecretWord(me.id === chId ? null : word)
    }
  }

  async function leaveRoom() {
    // stop heartbeat
    try { if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null } } catch (e) {}
    // remove this player's presence and reset local state
    const myId = myIdRef.current || (() => { try { return localStorage.getItem('chameleon_player_id') } catch (e) { return null } })()
    try {
      if (!localPresenceRef.current && myId) {
        const delRes = await supabase.from('players').delete().eq('id', myId).select()
        if (delRes.error) {
          console.error('leaveRoom: error removing player - response:', delRes)
        } else {
          // update local UI immediately
          setPlayers((prev) => prev.filter((p) => p.id !== myId))
          // notify other tabs that this player left
          try {
            const bc = setupBroadcast()
            if (bc) bc.postMessage({ type: 'player-left', payload: { id: myId } })
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('leaveRoom: exception removing player', e)
    }

    // call any unload handler and remove it
    try {
      if (typeof window !== 'undefined' && window._chameleon_remove_self) {
        try { window._chameleon_remove_self() } catch (e) {}
        try { window.removeEventListener('beforeunload', window._chameleon_remove_self) } catch (e) {}
        try { delete window._chameleon_remove_self } catch (e) {}
      }
    } catch (e) {}

    // clear ephemeral tab id so re-joining can create a fresh id if desired
    try {
      if (ephemeral) myIdRef.current = null
    } catch (e) {}

    setJoined(false)
    setPlayers([])
    setRole(null)
    setSecretWord(null)
    setCategory(null)
  }

  // Clear the current room: remove all player rows and reset the room payload.
  async function clearRoom() {
    const ok = await showConfirm(`Clear room "${room}"? This will remove all players and reset the room.`, 'Clear', 'Cancel')
    if (!ok) return
    const normalizedRoom = normalizeRoom(room)
    try {
      // delete all players in the room
      const delPlayers = await supabase.from('players').delete().eq('room', normalizedRoom)
      if (delPlayers.error) {
        console.error('clearRoom: delete players error', delPlayers)
        await showAlert('Failed to clear players for the room.')
        return
      }
      // delete the room payload as well
      const delRoom = await supabase.from('rooms').delete().eq('room', normalizedRoom)
      if (delRoom.error) {
        console.error('clearRoom: delete room error', delRoom)
        // continue — we already removed players
      }

      // broadcast to other tabs on the same origin
      try {
        const bc = setupBroadcast()
        if (bc) bc.postMessage({ type: 'room-cleared', payload: { room: normalizedRoom } })
      } catch (e) {}

      // local UI: notify and leave
      try { await showAlert('Room cleared — returning to home.') } catch (e) {}
      try { leaveRoom() } catch (e) {}
    } catch (e) {
      console.error('clearRoom exception', e)
      await showAlert('Failed to clear room (exception)')
    }
  }

  function chooseWord(cat, payloadCustomWords) {
    // category-aware word lists (expanded)
    const lists = {
      Animals: ['Cat', 'Dog', 'Elephant', 'Lion', 'Giraffe', 'Zebra', 'Kangaroo', 'Panda', 'Dolphin', 'Hedgehog', 'Owl', 'Penguin', 'Hippo', 'Fox', 'Rabbit'],
      Food: ['Pizza', 'Sushi', 'Burger', 'Pasta', 'Apple', 'Taco', 'Curry', 'Salad', 'Ice Cream', 'Chocolate', 'Bagel', 'Steak', 'Donut', 'Pancake', 'Ramen'],
      Places: ['Beach', 'Mountain', 'Paris', 'Tokyo', 'Forest', 'Desert', 'London', 'Sydney', 'Cairo', 'New York', 'Rio', 'Berlin', 'Rome', 'Iceland', 'Hawaii'],
      Objects: ['Piano', 'Rocket', 'Chair', 'Lamp', 'Phone', 'Bicycle', 'Backpack', 'Clock', 'Camera', 'Umbrella', 'Key', 'Book', 'Glasses', 'Spoon', 'Bottle'],
      Custom: Array.isArray(payloadCustomWords) && payloadCustomWords.length > 0 ? payloadCustomWords : [],
    }
    const defaultList = ['Apple', 'Beach', 'Piano', 'Rocket', 'Forest', 'Dog', 'Pizza', 'Chair', 'Mountain', 'Sushi']
    const pickFrom = (cat && lists[cat]) ? lists[cat] : defaultList
    return pickFrom.length > 0 ? pickFrom[Math.floor(Math.random() * pickFrom.length)] : ''
  }

  // Update room-level category so everyone sees it (writes to rooms.payload.category)
  async function updateRoomCategory(newCategory, newCustomWords = null) {
    const normalizedRoom = normalizeRoom(room)
    try {
      // fetch existing payload to avoid clobbering other fields
      const { data: roomRow } = await supabase.from('rooms').select('payload').eq('room', normalizedRoom).limit(1).single()
      const existing = roomRow?.payload || {}
      // If custom, sync customWords to payload
      let newPayload = { ...existing, category: newCategory }
      if (newCategory === 'Custom') {
        newPayload = { ...newPayload, customWords: newCustomWords || customWords }
      } else {
        if (newPayload.customWords) delete newPayload.customWords
      }
      const upsertRes = await supabase.from('rooms').upsert({ room: normalizedRoom, payload: newPayload }, { onConflict: 'room' }).select()
      if (upsertRes.error) {
        console.error('updateRoomCategory: upsert error', upsertRes.error)
        await showAlert('Failed to set category')
        return
      }
      // locally update so UI is responsive (Realtime will also sync)
      setCategory(newCategory)
      // broadcast to other tabs as an immediate hint
      try { const bc = setupBroadcast(); if (bc) bc.postMessage({ type: 'room-updated', payload: { room: normalizedRoom } }) } catch (e) {}
    } catch (e) {
      console.error('updateRoomCategory error', e)
      await showAlert('Failed to set category')
    }
  }

  return (
    <main className="container">
      <div className="card">
        <h1 className="title">🦎 Chameleon</h1>
        <p className="subtitle">Social deduction game for 3+ players</p>
        <div style={{ position: 'absolute', top: 12, right: 16 }}>
          <button onClick={toggleDark} className="btn" style={{ padding: '8px 10px', borderRadius: '8px', fontSize: '0.85rem' }}>
            {dark ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
        
        {localPresence && (
          <div style={{ background: 'var(--warning)', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center', fontWeight: 600, fontSize: '0.9rem' }}>
            ⚠️ Offline mode - presence writes failed
          </div>
        )}
        
        {!joined ? (
          <>
            {/* Categories Preview (pre-join) */}
            <div className="category-section">
              <div className="section-title">Available Categories</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {['Animals','Food','Places','Objects'].map(cat => (
                  <span key={cat} className="tag">{cat}</span>
                ))}
                <span className="tag tag-interactive" onClick={() => setShowCustomCat(!showCustomCat)}>
                  + Custom
                </span>
              </div>
              
              {showCustomCat && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>Add Custom Words</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Type a word..."
                      value={customInput}
                      onChange={e => setCustomInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customInput.trim()) {
                          const newList = [...customWords, customInput.trim()]
                          setCustomWords(newList)
                          setCustomInput('')
                          // If a room is selected, persist to room payload so everyone sees it
                          try { if (room && room.toString().trim() !== '') updateRoomCategory('Custom', newList) } catch (e) {}
                        }
                      }}
                      style={{ flex: 1, margin: 0 }}
                    />
                    <button
                      onClick={() => {
                        if (customInput.trim()) {
                          const newList = [...customWords, customInput.trim()]
                          setCustomWords(newList)
                          setCustomInput('')
                          try { if (room && room.toString().trim() !== '') updateRoomCategory('Custom', newList) } catch (e) {}
                        }
                      }}
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '8px 16px' }}
                    >Add</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {customWords.map((w, i) => (
                      <span key={w + i} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {w}
                        <button
                          onClick={() => {
                            (async () => {
                              const ok = await showConfirm(`Delete "${w}"? Are you sure?`)
                              if (!ok) return
                              const newList = customWords.filter((_, idx) => idx !== i)
                              setCustomWords(newList)
                              try { if (room && room.toString().trim() !== '') updateRoomCategory('Custom', newList) } catch (e) {}
                            })()
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <form onSubmit={e => { e.preventDefault(); join(); }} className="input-group">
              <input 
                className="input"
                placeholder="Room name" 
                value={room} 
                onChange={e => setRoom(e.target.value)}
              />
              <input 
                className="input"
                placeholder="Your name" 
                value={name} 
                onChange={e => setName(e.target.value)}
              />
              <label className="checkbox-label">
                <input type="checkbox" checked={ephemeral} onChange={e => setEphemeral(e.target.checked)} />
                <span>Multi-tab mode (ephemeral)</span>
              </label>
              <button type="submit" className="btn btn-primary">
                Join Room →
              </button>
            </form>
          </>
        ) : (
          <>
            {/* In-room view */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '12px', background: 'var(--background)', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Room</div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.1rem' }}>{room}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={leaveRoom} className="btn btn-secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem' }}>
                  Leave
                </button>
                <button onClick={() => { (async () => { await clearRoom() })() }} className="btn" style={{ background: 'var(--danger)', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem' }}>
                  Clear Room
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--background)', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>You</div>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>{name}</div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category:</label>
                <select 
                  value={category || ''} 
                  onChange={e => updateRoomCategory(e.target.value)}
                  className="input"
                  style={{ width: 'auto', padding: '6px 12px', margin: 0, fontSize: '0.9rem' }}
                >
                  <option value="">Select...</option>
                  <option value="Animals">🦁 Animals</option>
                  <option value="Food">🍕 Food</option>
                  <option value="Places">🗺️ Places</option>
                  <option value="Objects">🎸 Objects</option>
                  <option value="Custom">✨ Custom</option>
                </select>
              </div>
            </div>

            {category === 'Custom' && (
              <div className="category-section">
                <div className="section-title">Custom Words</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Add a word..."
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customInput.trim()) {
                        const newList = [...customWords, customInput.trim()]
                        setCustomWords(newList)
                        setCustomInput('')
                        updateRoomCategory('Custom', newList)
                      }
                    }}
                    style={{ flex: 1, margin: 0 }}
                  />
                  <button
                    onClick={() => {
                      if (customInput.trim()) {
                        const newList = [...customWords, customInput.trim()]
                        setCustomWords(newList)
                        setCustomInput('')
                        updateRoomCategory('Custom', newList)
                      }
                    }}
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '8px 16px' }}
                  >Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {customWords.map((w, i) => (
                    <span key={w + i} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {w}
                      <button
                        onClick={() => {
                          (async () => {
                            const ok = await showConfirm(`Delete "${w}"? Are you sure?`)
                            if (!ok) return
                            const newList = customWords.filter((_, idx) => idx !== i)
                            setCustomWords(newList)
                            updateRoomCategory('Custom', newList)
                          })()
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}
                      >×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <div className="section-title">Players ({players.length})</div>
              <div className="player-grid">
                {players.map((p) => (
                  <div key={p.id} className="player-card">
                    {p.name}
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={startGame} 
              disabled={!category} 
              className="btn btn-primary"
              style={{ marginBottom: '20px' }}
            >
              {!category ? 'Select a category first' : 'Start Game'}
            </button>

            {role && (
              <div className="role-reveal">
                <div style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px' }}>Your Role</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px' }}>
                  {role === 'Chameleon' ? '🦎 Chameleon' : '🕵️ Player'}
                </div>
                {secretWord && (
                  <div style={{ padding: '12px', background: 'var(--success)', color: 'white', borderRadius: '8px', fontWeight: 700, fontSize: '1.25rem' }}>
                    Secret: {secretWord}
                  </div>
                )}
                {!secretWord && (
                  <div style={{ padding: '12px', background: 'var(--warning)', color: 'white', borderRadius: '8px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    You're the Chameleon! Blend in and guess the secret word.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {/* Confirmation modal */}
      {confirmState.open && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-content">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{confirmState.message}</div>
              {confirmState.type === 'confirm' && (
                <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>This action cannot be undone.</div>
              )}
              <div className="modal-actions">
                {confirmState.type === 'confirm' ? (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleConfirm(false)}>{confirmState.cancelLabel || 'Cancel'}</button>
                    <button ref={primaryBtnRef} className="btn btn-primary" onClick={() => handleConfirm(true)}>{confirmState.okLabel || 'OK'}</button>
                  </>
                ) : (
                  <button ref={primaryBtnRef} className="btn btn-primary" onClick={() => handleConfirm(true)}>{confirmState.okLabel || 'OK'}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="footer">
        Made with Next.js & Supabase
      </div>
    </main>
  )
}

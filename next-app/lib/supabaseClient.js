import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
	// Provide an early helpful log if env is misconfigured
	// eslint-disable-next-line no-console
	console.error('Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in .env.local')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

// helper to quickly check connectivity (returns the raw response)
export async function checkSupabase() {
	try {
		// make a harmless request to get pg_stat or list tables via RPC is not allowed,
		// so do a simple HEAD/GET to the REST endpoint for health (players) and return full fetch response
		if (!supabaseUrl) return { ok: false, message: 'Missing SUPABASE_URL' }
		const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/players?limit=1`
		const res = await fetch(url, {
			method: 'GET',
			headers: {
				apikey: supabaseAnonKey || '',
				Authorization: `Bearer ${supabaseAnonKey || ''}`,
			},
		})
		const text = await res.text()
		return { ok: res.ok, status: res.status, statusText: res.statusText, body: text }
	} catch (e) {
		return { ok: false, error: e }
	}
}

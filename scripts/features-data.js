// features-data.js

export const RECCOBEATS_BASE = "https://api.reccobeats.com/v1";
export const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

// Cache audio features by Spotify track ID
const audioFeatureCache = new Map();

// Spotify helpers
export function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

export function extractSpotifyIdFromHref(href) {
    if (!href) return null;
    const match = String(href).match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
}

function spotifySearchEscape(s) {
    return String(s || "")
        .replace(/"/g, '\\"')
        .replace(/\s+/g, " ")
        .trim();
}

export async function spotifyFetch(token, url) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify fetch failed: ${res.status} ${text}`);
    }

    return res.json();
}

// Get audio features from ReccoBeats
export async function getTrackFeaturesFromReccoBeats(spotifyTrackId) {
    if (!spotifyTrackId) return null;
    if (audioFeatureCache.has(spotifyTrackId)) return audioFeatureCache.get(spotifyTrackId);

    const url = `${RECCOBEATS_BASE}/audio-features?ids=${encodeURIComponent(spotifyTrackId)}`;
    const res = await fetch(url);

    if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        throw new Error(`Rate limited (429). Retry after: ${retryAfter || "unknown"}s`);
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ReccoBeats audio-features failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const list = data?.content;

    if (Array.isArray(list) && list.length > 0 && list[0]) {
        const features = list[0];
        audioFeatureCache.set(spotifyTrackId, features);
        return features;
    }

    return null;
}

export async function getManyFeaturesFromReccoBeats(spotifyIds) {
    const ids = uniq(spotifyIds);
    if (!ids.length) return new Map();

    const url = `${RECCOBEATS_BASE}/audio-features?ids=${encodeURIComponent(ids.join(","))}`;
    const res = await fetch(url);

    if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        throw new Error(`Rate limited (429). Retry after: ${retryAfter || "unknown"}s`);
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ReccoBeats multi audio-features failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const list = Array.isArray(data?.content) ? data.content : [];

    const map = new Map();
    list.forEach((f) => {
        const spotifyId = extractSpotifyIdFromHref(f?.href);
        if (spotifyId) map.set(spotifyId, f);
    });

    return map;
}
/*
// Get recommendations from ReccoBeats 
export async function fetchReccoBeatsRecommendations(spotifyTrackId, size = 20) {
    if (!spotifyTrackId) return [];

    const url = new URL(`${RECCOBEATS_BASE}/track/recommendation`);
    url.searchParams.set("seeds", spotifyTrackId);
    url.searchParams.set("size", String(size));

    const res = await fetch(url.toString());

    if (res.status === 400) return [];

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Recommendation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data?.content || [];
}
*/
// Get similar tracks from Last.fm API
export async function lastfmGetSimilarTracks({ apiKey, artist, track, limit = 30 }) {
    if (!apiKey) throw new Error("Last.fm key missing");
	
	const a = String(artist || "").trim();
	const t = String(track || "").trim();
    if (!a || !t) return [];

    const url = new URL(LASTFM_BASE);
    url.searchParams.set("method", "track.getSimilar");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("artist", a);
    url.searchParams.set("track", t);
    url.searchParams.set("autocorrect", "1");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    const data = await res.json();
	
	console.log("[Last.fm] getSimilar request:", { artist: a, track: t, status: res.status, data });

    if (!res.ok || data?.error) {
        throw new Error(`Last.fm getSimilar failed: ${data?.message || res.status}`);
    }

    const raw = data?.similartracks?.track;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return items
        .map((t) => ({
            name: (t?.name || "").trim(),
            artist: (t?.artist?.name || t?.artist || "").trim(),
            match: Number(t?.match ?? 0),
        }))
        .filter((t) => t.name && t.artist);
}

// Fallback: Get similar artists if similar songs is unavailable
export async function lastfmGetSimilarArtists({ apiKey, artist, limit = 10 }) {
    if (!apiKey) throw new Error("Last.fm key missing");
	if (!artist) return [];

    const url = new URL(LASTFM_BASE);
    url.searchParams.set("method", "artist.getSimilar");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("artist", artist);
    url.searchParams.set("autocorrect", "1");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || data?.error) {
        throw new Error(`Last.fm artist.getSimilar failed: ${data?.message || res.status}`);
    }

    const raw = data?.similarartists?.artist;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return items
        .map(a => ({
            name: (a?.name || "").trim(),
            match: Number(a?.match ?? 0),
        }))
        .filter(a => a.name);
}

// Fallback: Get similar artists top tracks if similar songs is unavailable
export async function lastfmGetArtistTopTracks({ apiKey, artist, limit = 10 }) {
    if (!apiKey) throw new Error("Last.fm key missing");
	if (!artist) return [];

    const url = new URL(LASTFM_BASE);
    url.searchParams.set("method", "artist.getTopTracks");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("artist", artist);
    url.searchParams.set("autocorrect", "1");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || data?.error) {
        throw new Error(`Last.fm artist.getTopTracks failed: ${data?.message || res.status}`);
    }

    const raw = data?.toptracks?.track;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    return items
        .map(t => ({
            name: (t?.name || "").trim(),
            artist: (t?.artist?.name || t?.artist || "").trim(),
        }))
        .filter(t => t.name && t.artist);
}

// 2) Resolve a (track, artist) pair to a Spotify track ID
export async function spotifyResolveTrackId(token, { name, artist, market = "GB" }) {
    if (!name || !artist) return null;

    const q = `track:"${spotifySearchEscape(name)}" artist:"${spotifySearchEscape(artist)}"`;
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "1");
    url.searchParams.set("market", market);
    url.searchParams.set("q", q);

    const data = await spotifyFetch(token, url.toString());
    return data?.tracks?.items?.[0]?.id || null;
}

// 3) Resolve many pairs with throttling + de-dupe
export async function spotifyResolveManyTrackIds(token, pairs, { market = "GB", concurrency = 5 } = {}) {
    const list = Array.isArray(pairs) ? pairs : [];
    if (!list.length) return [];

    const out = [];
    let i = 0;

    async function worker() {
        while (i < list.length) {
            const idx = i++;
			const p = list[idx];
            try {
                const id = await spotifyResolveTrackId(token, { name: p.name, artist: p.artist, market });
                if (id) out.push({ id, match: Number(p.match ?? 0) });
            } catch {
                // ignore single lookup failures
            }
        }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

	const best = new Map();
	for (const x of out) {
		const prev = best.get(x.id);
		if (!prev || x.match > prev.match) best.set(x.id, x);
	}
    return [...best.values()];
}

export async function buildCandidatePool({
    token,
    trackId,
    seedMeta,
    market,
    maxCandidates = 120,
    reccoSize = 40,
    playlistQueryLimit = 4,
    playlistsPerQuery = 3,
    tracksPerPlaylist = 40,
    sameArtistCap = 4,
    sameAlbumCap = 2,

    // Optional Last.fm
    lastfmKey = null,
    lastfmLimit = 30,
} = {}) {
    let candidateIds = [];

    // 0) ReccoBeats (variety)
    const recommendations = await fetchReccoBeatsRecommendations(trackId, reccoSize);
    candidateIds.push(
        ...recommendations.map((r) => r?.spotifyId || extractSpotifyIdFromHref(r?.href)).filter(Boolean)
    );

    // 0b) Last.fm similar -> resolve to Spotify IDs (adds “scene” relevance)
    if (lastfmKey) {
        const seedArtist = seedMeta?.artists?.[0]?.name || "";
        const seedTrack = seedMeta?.name || "";
        const pairs = await lastfmGetSimilarTracks({ apiKey, artist, track, limit: lastfmLimit });
        const ids = await spotifyResolveManyTrackIds(token, pairs, { market, concurrency: 5 });
        candidateIds.push(...ids);
    }

    // 1) Same artist top tracks (cap)
    const primaryArtistId = seedMeta?.artists?.[0]?.id || null;
    if (primaryArtistId) {
        const topArtist = await getArtistTopTrackIds(token, primaryArtistId, market);
        candidateIds.push(...topArtist.slice(0, sameArtistCap));
    }

    // 2) Same album tracks (cap)
    const albumId = seedMeta?.album?.id || null;
    if (albumId) {
        const albumTracks = await getAlbumTrackIds(token, albumId);
        candidateIds.push(...albumTracks.slice(0, sameAlbumCap));
    }

    // 3) Playlist harvesting (crowd/scene signal)
    const queries = buildPlaylistQueries(seedMeta).slice(0, playlistQueryLimit);

    for (const q of queries) {
        const pids = await searchPlaylistIds(token, q, playlistsPerQuery);
        for (const pid of pids) {
            const ids = await getPlaylistTrackIds(token, pid, tracksPerPlaylist);
            candidateIds.push(...ids);

            if (candidateIds.length >= maxCandidates * 2) break;
        }
        if (candidateIds.length >= maxCandidates * 2) break;
    }

    // Clean
    candidateIds = uniq(candidateIds).filter((id) => id && id !== trackId);

    return candidateIds.slice(0, maxCandidates);
}

// Similarity score for bar chart
export function similarityScore(seed, rec) {
    const keys = ["danceability", "energy", "valence", "speechiness", "acousticness", "instrumentalness"];
    const weights = {
        danceability: 1,
        energy: 1,
        valence: 1,
        speechiness: 1,
        acousticness: 1,
        instrumentalness: 1,
    };

    let d = 0;
    let wsum = 0;

    for (const k of keys) {
        const a = Number(seed?.[k]);
        const b = Number(rec?.[k]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

        const w = weights[k] ?? 1;
        d += w * Math.abs(a - b);
        wsum += w;
    }

    if (wsum === 0) return 0;
    return 1 - d / wsum;
}

export function rerankByAudioPlusMeta(seedFeatures, seedMeta, rows) {
    const seedPop = Number(seedMeta?.popularity);
    const seedYear = getYearFromReleaseDate(seedMeta?.album?.release_date);

    return (rows || [])
        .map((r) => {
            const recPop = Number(r?.meta?.popularity);
            const recYear = getYearFromReleaseDate(r?.meta?.album?.release_date);

            const audio = Number(r?.score) || 0;
            const pop = popularitySimilarity(seedPop, recPop);
            const year = yearSimilarity(seedYear, recYear);

            const finalScore = 0.75 * audio + 0.15 * pop + 0.10 * year;

            return { ...r, finalScore, pop, year };
        })
        .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}


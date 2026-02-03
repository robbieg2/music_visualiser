// features-data.js

export const RECCOBEATS_BASE = "https://api.reccobeats.com/v1";

// Cache audio features by Spotify track ID
const audioFeatureCache = new Map();

export function extractSpotifyIdFromHref(href) {
    if (!href) return null;
    const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
}

export async function spotifyFetch(token, url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify fetch failed: ${res.status} ${text}`);
    }
    return res.json();
}

// Retrieve audio features from ReccoBeats
export async function getTrackFeaturesFromReccoBeats(spotifyTrackId, spotifyToken = null) {
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
    const list = data.content;

    if (Array.isArray(list) && list.length > 0 && list[0]) {
        const features = list[0];
        audioFeatureCache.set(spotifyTrackId, features);
        return features;
    }
}

export async function getManyFeaturesFromReccoBeats(spotifyIds) {
    const url = `${RECCOBEATS_BASE}/audio-features?ids=${encodeURIComponent(spotifyIds.join(","))}`;
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
    const list = data.content || [];

    const map = new Map();
    list.forEach((f) => {
        const spotifyId = extractSpotifyIdFromHref(f.href);
        if (spotifyId) map.set(spotifyId, f);
    });

    return map;
}

export async function fetchReccoBeatsRecommendations(spotifyTrackId, size = 20) {
    const url = new URL(`${RECCOBEATS_BASE}/track/recommendation`);
    url.searchParams.append("seeds", spotifyTrackId);
    url.searchParams.append("size", size);

    const res = await fetch(url);

    if (res.status === 400) {
        // Seed sometimes not found in ReccoBeats
        return [];
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Recommendation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.content || [];
}

export function getYearFromReleaseDate(dateStr) {
    if (!dateStr) return null;
    const y = Number(String(dateStr).slice(0, 4));
    return Number.isFinite(y) ? y : null;
}

export function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

export function popularitySimilarity(seedPop, recPop) {
    if (!Number.isFinite(seedPop) || !Number.isFinite(recPop)) return 0.5;
    return clamp01(1 - Math.abs(seedPop - recPop) / 100);
}

export function yearSimilarity(seedYear, recYear) {
    if (!Number.isFinite(seedYear) || !Number.isFinite(recYear)) return 0.5;
    const diff = Math.min(Math.abs(seedYear - recYear), 20);
    return clamp01(1 - diff / 20);
}

export async function getSeedMarket(seedMeta) {
    // Spotify requires a market param for top-tracks
    return (seedMeta?.available_markets && seedMeta.available_markets[0]) ? seedMeta.available_markets[0] : "GB";
}

export async function getArtistTopTrackIds(token, artistId, market) {
    const data = await spotifyFetch(token, `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=${market}`);
    return (data.tracks || []).map(t => t.id).filter(Boolean);
}

export async function getAlbumTrackIds(token, albumId) {
    const data = await spotifyFetch(token, `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`);
    return (data.items || []).map(t => t.id).filter(Boolean);
}

export function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
}

// --- Playlist harvesting helpers (Spotify search + playlist tracks) ---

export async function searchPlaylistIds(token, query, limit = 5) {
    const q = encodeURIComponent(query);
    const data = await spotifyFetch(
        token,
        `https://api.spotify.com/v1/search?q=${q}&type=playlist&limit=${limit}`
    );

    return (data.playlists?.items || [])
        .map((p) => p?.id)
        .filter(Boolean);
}

export async function getPlaylistTrackIds(token, playlistId, limit = 50) {
    // limit max is 100; keep it modest to reduce calls
    const data = await spotifyFetch(
        token,
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`
    );

    // Some items can be null / local tracks / removed tracks
    return (data.items || [])
        .map((x) => x?.track?.id)
        .filter(Boolean);
}

export function buildPlaylistQueries(seedMeta) {
    const artistName = seedMeta?.artists?.[0]?.name || "";
    const trackName = seedMeta?.name || "";

    // These tend to work well without relying on any deprecated endpoints
    const queries = [
        artistName,
        `${artistName} radio`,
        `${artistName} mix`,
        `${trackName} mix`,
        `${artistName} indie`,
    ];

    // Deduplicate / remove empties
    return uniq(queries.map((q) => String(q || "").trim()).filter(Boolean));
}

/**
 * Build a broader candidate pool from:
 *  - ReccoBeats recommendations (variety)
 *  - Same artist top tracks (small sprinkle)
 *  - Same album tracks (small sprinkle)
 *  - Playlist harvesting (crowd signal)
 *
 * Returns a deduped array of Spotify track IDs.
 */
export async function buildCandidatePool({
    token,
    trackId,
    seedMeta,
    market,
    maxCandidates = 120,
    reccoSize = 40,
    playlistQueryLimit = 4,     // how many playlist queries to run
    playlistsPerQuery = 3,      // how many playlists per query
    tracksPerPlaylist = 40,     // how many tracks from each playlist
    sameArtistCap = 4,
    sameAlbumCap = 2,
}) {
    let candidateIds = [];

    // 0) Main pool: ReccoBeats (variety)
    const recommendations = await fetchReccoBeatsRecommendations(trackId, reccoSize);
    const recSpotifyIds = recommendations
        .map((r) => r.spotifyId || extractSpotifyIdFromHref(r.href))
        .filter(Boolean);

    candidateIds.push(...recSpotifyIds);

    // 1) Sprinkle: same artist top tracks (cap)
    const primaryArtistId = seedMeta?.artists?.[0]?.id || null;
    if (primaryArtistId) {
        const topArtist = await getArtistTopTrackIds(token, primaryArtistId, market);
        candidateIds.push(...topArtist.slice(0, sameArtistCap));
    }

    // 2) Sprinkle: same album tracks (cap)
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

            // If we’ve got plenty, stop early to avoid too many API calls
            if (candidateIds.length >= maxCandidates * 2) break;
        }
        if (candidateIds.length >= maxCandidates * 2) break;
    }

    // Clean
    candidateIds = uniq(candidateIds)
        .filter((id) => id && id !== trackId);

    // Keep reasonable size
    return candidateIds.slice(0, maxCandidates);
}

export function rerankByAudioPlusMeta(seedFeatures, seedMeta, rows) {
    const seedPop = Number(seedMeta?.popularity);
    const seedYear = getYearFromReleaseDate(seedMeta?.album?.release_date);

    return rows
        .map((r) => {
            const recPop = Number(r.meta?.popularity);
            const recYear = getYearFromReleaseDate(r.meta?.album?.release_date);

            const audio = r.score;
            const pop = popularitySimilarity(seedPop, recPop);
            const year = yearSimilarity(seedYear, recYear);

            const finalScore = 0.75 * audio + 0.15 * pop + 0.10 * year;

            return { ...r, finalScore, pop, year };
        })
        .sort((a, b) => b.finalScore - a.finalScore);
}

export function similarityScore(seed, rec) {
    const keys = ["danceability", "energy", "valence", "speechiness", "acousticness", "instrumentalness"];
    const weights = { danceability: 1, energy: 1, valence: 1, speechiness: 0.7, acousticness: 0.7, instrumentalness: 0.7 };

    let d = 0;
    let wsum = 0;

    for (const k of keys) {
        const a = Number(seed[k]);
        const b = Number(rec[k]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

        const w = weights[k] ?? 1;
        d += w * Math.abs(a - b);
        wsum += w;
    }

    if (wsum === 0) return 0;
    return 1 - d / wsum;
}

// features.js

import {
    extractSpotifyIdFromHref,
    fetchReccoBeatsRecommendations,
    getManyFeaturesFromReccoBeats,
    getTrackFeaturesFromReccoBeats,
    rerankByAudioPlusMeta,
    similarityScore,
    spotifyFetch,
    spotifyResolveManyTrackIds,
    lastfmGetSimilarTracks,
	lastfmGetSimilarArtists,
	lastfmGetArtistTopTracks,
} from "./features-data.js";

import { drawMultiRadarChart, drawSimilarityBarChart, drawSimilarityScatter } from "./features-charts.js";

const trackInfo = document.getElementById("track-info");
const logoutBtn = document.getElementById("logout-btn");
const backBtn = document.getElementById("back-btn");

// --- UI helpers ---

function setLoading(on, sub = "") {
	const overlay = document.getElementById("page-loading");
	const subEl = document.getElementById("loading-sub");
	if (!overlay) return;
	
	if (subEl && sub) subEl.textContent = sub;
	
	overlay.style.display = on ? "flex" : "none";
}
	
function renderTrackHeader(track) {
    const artists = (track.artists || []).join(", ");

    trackInfo.innerHTML = `
        <div class="seed-header">
            ${track.image ? `<img class="seed-cover" src="${track.image}" alt="Album cover">` : ""}

            <div class="seed-meta">
                <h1 class="seed-title">${track.name}</h1>
                <p class="seed-artists">${artists}</p>

                <iframe
                    class="seed-embed"
                    src="https://open.spotify.com/embed/track/${track.id}"
                    frameborder="0"
                    allowtransparency="true"
                    allow="encrypted-media">
                </iframe>
            </div>
        </div>
    `;
}

function hideVisualSections() {
    const simRadar = document.getElementById("sim-radar");
    const simBar = document.getElementById("sim-bar");
    const simScatter = document.getElementById("sim-scatter");
	const msgCard = document.getElementById("card-message");
    const noFeat = document.getElementById("no-features");
	
    const radarCard = document.getElementById("card-radar");
    const barCard = document.getElementById("card-bar");
    const scatterCard = document.getElementById("card-scatter");
    const recsCard = document.getElementById("recs-card");

    if (simRadar) simRadar.innerHTML = "";
    if (simBar) simBar.innerHTML = "";
    if (simScatter) simScatter.innerHTML = "";

    if (recsCard) recsCard.style.display = "none";
    if (scatterCard) scatterCard.style.display = "none";
    if (barCard) barCard.style.display = "none";
    if (radarCard) radarCard.style.display = "none";

	if (msgCard) msgCard.style.display = "flex";
    if (noFeat) {
        noFeat.style.display = "block";
        noFeat.innerHTML = `
            <div>
                <h3>No audio features available for this track</h3>
                <p style="opacity:0.85;">Try another song</p>
            </div>
        `;
    }
}

function showVisualSections() {   
    const radarCard = document.getElementById("card-radar");
    const barCard = document.getElementById("card-bar");
    const scatterCard = document.getElementById("card-scatter");
    const recsCard = document.getElementById("recs-card");
	const msgCard = document.getElementById("card-message");
	const noFeat = document.getElementById("no-features");
	
    if (recsCard) recsCard.style.display = "block";
    if (scatterCard) scatterCard.style.display = "block";
    if (barCard) barCard.style.display = "block";
    if (radarCard) {
		radarCard.style.display = "block";
		radarCard.classList.remove("centered-message");
	}
	
	if (msgCard) msgCard.style.display = "none";
	if (noFeat) {
		noFeat.style.display = "none";
		noFeat.innerHTML = "";
	}
}

function renderRecommendations(spotifyIds, { subtitle = "" } = {}) {
    const container = document.getElementById("recommendations");
    if (!container) return;

    if (!spotifyIds || spotifyIds.length === 0) {
        container.innerHTML = `
            <h3>Recommended Tracks</h3>
            <p class="muted">No recommendations available.</p>
        `;
        return;
    }

    container.innerHTML = `
		<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px;">
			<h3 style="margin:0;">Recommended Tracks</h3>
			${subtitle ? `<span class="muted" style="font-size:12px;">${subtitle}</span>` : ""}
		</div>
		
		<div class="carousel-wrapper">
			<button class="scroll-btn" id="recs-scroll-left" aria-label="Scroll left"><</button>
			<div class="carousel" id="recs-carousel"></div>
			<button class="scroll-btn" id="recs-scroll-right" aria-label="Scroll right">></button>
		</div>
	`;
	
	const carousel = document.getElementById("recs-carousel");
	if (!carousel) return;

    spotifyIds.forEach((id) => {
        const card = document.createElement("div");
		card.className = "rec-card";
		card.innerHTML = `
			<iframe
				src="https://open.spotify.com/embed/track/${id}"
				width="100%"
				height="153"
				frameborder="0"
				allow="encrypted-media">
			</iframe>
		`;
		carousel.appendChild(card);
	});
        
	const leftBtn = document.getElementById("recs-scroll-left");
	const rightBtn = document.getElementById("recs-scroll-right");
	
	const scrollByAmount = () => Math.max(260, Math.floor(carousel.clientWidth * 0.85));
	
	if (leftBtn) {
		leftBtn.addEventListener("click", () => {
			carousel.scrollBy({ left: -scrollByAmount(), behaviour: "smooth" });
		});
	}
	if (rightBtn) {
		rightBtn.addEventListener("click", () => {
			carousel.scrollBy({ left: scrollByAmount(), behaviour: "smooth" });
		});
	}
}

// --- data helpers ---
function normalizeSpotifyIds(list) {
	return (list || [])
		.map(x => {
		if (typeof x === "string") return x;
		if (x && typeof x === "object") return x.id || x.spotifyId || null;
		return null;
	})
	.filter(id => typeof id === "string" && id.length > 0);
}


function getSeedMarketFromSeedMeta(seedMeta) {
    // Spotify “top tracks” uses market; for searches it also helps consistency.
    // If not present, default to GB.
    return (seedMeta?.available_markets && seedMeta.available_markets[0]) ? seedMeta.available_markets[0] : "GB";
}

function cleanTrackName(name) {
	return String(name || "")
		.replace(/\s*\(.*?\)\s*/g, " ")
		.replace(/\s*-\s*(remaster(ed)?|live|mono|radio edit|edit|version|mix).*$/i, "")
		.replace(/\s+/g, " ")
		.trim();
}


async function getLastfmSimilarPairsSafe({ apiKey, artist, track, limit }) {
    try {
        return await lastfmGetSimilarTracks({
            apiKey,
            artist,
            track,
            limit,
        });
    } catch (e) {
        return await lastfmGetSimilarTracks({
            LASTFM_KEY: apiKey,
            seedArtist: artist,
            seedTrack: track,
        });
    }
}

async function init() {
    if (backBtn) backBtn.addEventListener("click", () => (window.location.href = "home.html"));

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("access_token");
            window.location.href = "index.html";
        });
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const trackParam = params.get("track");

    if (!trackParam) {
        if (trackInfo) trackInfo.innerHTML = "<p>No track provided</p>";
        return;
    }

    let track;
    try {
        track = JSON.parse(decodeURIComponent(trackParam));
    } catch {
        if (trackInfo) trackInfo.innerHTML = "<p>Invalid track data</p>";
        return;
    }

    renderTrackHeader(track);

    const simRadar = document.getElementById("sim-radar");

    try {	
		setLoading(true, "Fetching audio features...");
		
        // 1) Seed features (required for this page)
        const seedFeatures = await getTrackFeaturesFromReccoBeats(track.id);

        if (!seedFeatures) {
            hideVisualSections();
            return;
        }

        showVisualSections();

        // 2) Seed meta
        const seedMeta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${track.id}`);
        const market = getSeedMarketFromSeedMeta(seedMeta);

        const seedArtistName = seedMeta?.artists?.[0]?.name || track.artists?.[0] || "";
        const seedTrackName = seedMeta?.name || track.name || "";

        // 3) Last.fm similar tracks (pairs)
        const LASTFM_API_KEY = "2e23f6b1b4b3345ab5e33a788a072303";

		const seedTrackNameClean = cleanTrackName(seedTrackName);
		
		let recMode = "similar tracks";
		
        let similarPairs = await lastfmGetSimilarTracks({
            apiKey: LASTFM_API_KEY,
            artist: seedArtistName,
            track: seedTrackName,
            limit: 30,
        });
		
		if (!similarPairs.length) {
			recMode = "similar artists";
			
			const similarArtists = await lastfmGetSimilarArtists({
				apiKey: LASTFM_API_KEY,
				artist: seedArtistName,
				limit: 8,
			});
			
			const topTrackPairs = [];
			for (const a of similarArtists) {
				const tops = await lastfmGetArtistTopTracks({
					apiKey: LASTFM_API_KEY,
					artist: a.name,
					limit: 4,
				});
				topTrackPairs.push(...tops);
			}
			
			similarPairs = topTrackPairs;
		}
		
		console.log("Last.fm pairs:", similarPairs.length, similarPairs.slice(0, 5));
		
		// Stop here if Last.fm gives nothing (so you *know* it's the issue)
		if (!similarPairs.length) {
		    const recs = document.getElementById("recommendations");
		    if (recs) {
			recs.innerHTML = `
				<h3>Recommended Tracks</h3>
				<p style="opacity:0.85; text-align:center;">
					Last.fm couldn't find similar tracks for this seed.
					<br/>Try another song (or a more popular track).
			  </p>
			`;
		}

		drawMultiRadarChart([{ label:`Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed:true }]);
		return;
		}
		
        // 4) Resolve to Spotify IDs
        let candidateIds = await spotifyResolveManyTrackIds(token, similarPairs, { market, concurrency: 5 });
		
		candidateIds = normalizeSpotifyIds(candidateIds);
		
		console.log("Resolved IDs:", candidateIds.length);
/*
        // 5) Fallback: ReccoBeats to keep UX alive
        if (candidateIds.length < 12) {
            const recommendations = await fetchReccoBeatsRecommendations(track.id, 40);
            const recSpotifyIds = recommendations
                .map((r) => r.spotifyId || extractSpotifyIdFromHref(r.href))
                .filter(Boolean);

            candidateIds = [...new Set([...candidateIds, ...recSpotifyIds])].slice(0, 40);
        } else {
            candidateIds = [...new Set(candidateIds)].slice(0, 40);
        }
*/
        // Guard: no candidates
        if (candidateIds.length === 0) {
            renderRecommendations([]);
            drawMultiRadarChart([{ label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true }]);
            drawSimilarityBarChart([]);
            drawSimilarityScatter(seedFeatures, []);
            return;
        }

        // 6) Pull features + meta for candidates
        const recFeaturesMap = await getManyFeaturesFromReccoBeats(candidateIds);

        const meta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${candidateIds.join(",")}`);
        const metaMap = new Map((meta.tracks || []).filter(Boolean).map((t) => [t.id, t]));

        const rows = candidateIds
            .map((id) => {
                const f = recFeaturesMap.get(id);
                if (!f) return null;

                const t = metaMap.get(id);
                return {
                    id,
                    features: f,
                    score: similarityScore(seedFeatures, f),
                    meta: t || null,
                    track: t
                        ? {
                              id: t.id,
                              name: t.name,
                              artists: (t.artists || []).map((a) => a.name),
                              image: t.album?.images?.[0]?.url || "",
                          }
                        : { id, name: "Recommended", artists: [], image: "" },
                };
            })
            .filter(Boolean);

        // Guard: none have features
        if (rows.length === 0) {
            renderRecommendations([]);
            drawMultiRadarChart([{ label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true }]);
            drawSimilarityBarChart([]);
            drawSimilarityScatter(seedFeatures, []);
            return;
        }

        // 7) Rank
        const reranked = rerankByAudioPlusMeta(seedFeatures, seedMeta, rows);

        const top10 = reranked.slice(0, 10);
        const top15 = reranked.slice(0, 15);

        // 8) Radar series: seed + up to 4 best matches
        const radarSeries = [
            { label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true },
            ...top10.slice(0, 4).map((r) => ({
                label: r.track?.name || "Track",
                id: r.id,
                features: r.features,
                isSeed: false,
            })),
        ];

        // 9) Render UI
        renderRecommendations(top10.map(r => r.id), {
			subtitle: recMode === "similar tracks"
				? "Based on similar songs"
				: "Based on similar artists",
		});
		
        drawMultiRadarChart(radarSeries);
        drawSimilarityBarChart(top10);
        drawSimilarityScatter(seedFeatures, top15);
    } catch (err) {
        console.error(err);
    } finally {
		setLoading(false);
	}
}

init();


	
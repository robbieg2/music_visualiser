// features.js

import {
    extractSpotifyIdFromHref,
//    fetchReccoBeatsRecommendations,
    getManyFeaturesFromReccoBeats,
    getTrackFeaturesFromReccoBeats,
//    rerankByAudioPlusMeta,
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

// Loading wheel while page renders
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


// Tooltip helpers
const tooltipEl = document.getElementById("chart-tooltip");

function showTooltip(html) {
	if (!tooltipEl) return;
	tooltipEl.innerHTML = html;
	tooltipEl.style.display = "block";
}

function hideTooltip() {
	if (!tooltipEl) return;
	tooltipEl.style.display = "none";
	tooltipEl.innerHTML = "";
}
/*
function explainClosestDims(seed, rec) {
	const dims = [
		{ key: "danceability", label: "Danceability" },
        { key: "energy", label: "Energy" },		
        { key: "valence", label: "Valence" },
        { key: "speechiness", label: "Speechiness" },
        { key: "acousticness", label: "Acousticness" },
		{ key: "instrumentalness", label: "Instrumental" },
    ];
	
	const scored = dims
		.map (d => {
			const a = Number(seed?.[d.key]);
			const b = Number(rec?.[d.key]);
			if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
			return { ...d, diff: Math.abs(a - b) };
		})
		.filter(Boolean)
		.sort((x, y) => x.diff - y.diff);
	
	return scored.slice(0, 3).map(x => x.label);
} */

function attachSimilarityHelpPopover() {
	const btn = document.getElementById("sim-help");
	if (!btn) return;
	
	const html = `
		<div class="tt-title">How similarity is calculated</div>

		<div class="tt-sub">
			<p>
				The seed track is compared to each recommendation using these audio features:
				<b>danceability</b>, <b>energy</b>, <b>valence</b>, <b>speechiness</b>,
				<b>acousticness</b>, and <b>instrumentalness</b>
			</p>

			<p>
				For each feature the distance between the two values is measured (0–1).
				The closer they are, the higher the similarity
				We then average the distances with a few weights:
				danceability/energy/valence count most, the others count slightly less.
			</p>

			<p>
				<b>Similarity Score</b> = <b>100%</b> means “very similar features” and
				<b>0%</b> means “very different”
			</p>
		</div>
	`;
	
	btn.addEventListener("mouseenter", (e) => {
		showTooltip(html);
	});
	
	btn.addEventListener("mouseleave", () => hideTooltip());
}

// Hide visualisations when no audio features are available
function hideVisualSections() {
    const simRadar = document.getElementById("sim-radar");
    const simBar = document.getElementById("sim-bar");
    const simScatter = document.getElementById("sim-scatter");
	const msgCard = document.getElementById("card-message");
    const noFeat = document.getElementById("no-features");
	const tip = document.getElementById("chart-tip");
	
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
	if (tip) tip.style.display = "none";

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

// Show visualisations when audio features are available
function showVisualSections() {   
    const radarCard = document.getElementById("card-radar");
    const barCard = document.getElementById("card-bar");
    const scatterCard = document.getElementById("card-scatter");
    const recsCard = document.getElementById("recs-card");
	const msgCard = document.getElementById("card-message");
	const noFeat = document.getElementById("no-features");
	const tip = document.getElementById("chart-tip");
	
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
	if (tip) tip.style.display = "flex";
}

// Show recommendation embeds with tasters
function renderRecommendations(items = [], { subtitle } = {}) {
    const container = document.getElementById("recommendations");
    if (!container) return;
	
	const rows = (items || [])
		.map((x) => (typeof x === "string" ? { id: x } : x))
		.filter((x) => x && x.id);
		
	if (rows.length === 0) {
		container.innerHTML = `
			<div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px;">
			<h3 style="margin:0;">Recommended Tracks</h3>
				${subtitle ? `<span class="muted" style="font-size:12px;">${subtitle}</span>` : ""}
			</div>
			<p class="muted" style="margin-top:10px;">No recommendations available</p>
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

    rows.forEach((r) => {
		const id = r.id;
		
        const card = document.createElement("div");
		card.className = "rec-card";
		card.dataset.trackId = id;
		card.innerHTML = `
			<iframe
				src="https://open.spotify.com/embed/track/${id}"
				width="100%"
				height="153"
				frameborder="0"
				allow="encrypted-media">
			</iframe>
		`;
	
		card.addEventListener("mouseenter", (e) => {
/*			try {
				const name = r.track?.name || "Unknown Track";
				const artists = (r.track?.artists || []).join(", ") || "Unknown Artist";
				const simPct = Number.isFinite(r.score) ? Math.round(r.score * 100) : null;
				
				const closest = 
					typeof explainClosestDims === "function" && window.__seedFeatures && r.features
						? explainClosestDims(window.__seedFeatures, r.features)
						: [];
						
				const closestText = closest.length ? closest.join(" * ") : "-";
			
				if (typeof showTooltip === "function") {
					showTooltip(`
						<div class="tt-title">${name}</div>
						<div class="tt-sub">${artists}</div>
						<div class="tt-row"><span class="tt-muted">Similarity</span><span>${simPct ?? "-"}%</span></div>
						<div class="tt-row"><span class="tt-muted">Closest</span><span>${closestText}</span></div>
					`);
				}
			} catch (err) {
				console.warn("Tooltip error:", err);
			} */
			
			window.dispatchEvent(new CustomEvent("rec-hover", { detail: { trackId: id, payload: { row: r } }
			}));
		}); 
		
		card.addEventListener("mouseleave", () => {
			window.dispatchEvent(new CustomEvent("rec-hover", { detail: { trackId: null } }));
		});	
		
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

// Functions to clean/aid API data
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
	attachSimilarityHelpPopover();

    const simRadar = document.getElementById("sim-radar");

    try {	
		setLoading(true, "Fetching audio features...");
		
        const seedFeatures = await getTrackFeaturesFromReccoBeats(track.id);

        if (!seedFeatures) {
            hideVisualSections();
            return;
        }

        showVisualSections();
		
		// Assorting recommendations
        const seedMeta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${track.id}`);
        const market = getSeedMarketFromSeedMeta(seedMeta);

        const seedArtistName = seedMeta?.artists?.[0]?.name || track.artists?.[0] || "";
        const seedTrackName = seedMeta?.name || track.name || "";

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
					limit: 2,
				});
				topTrackPairs.push(...tops);
			}
			
			similarPairs = topTrackPairs;
		}
		
		console.log("Last.fm pairs:", similarPairs.length, similarPairs.slice(0, 5));
		
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
		
        let candidateIds = await spotifyResolveManyTrackIds(token, similarPairs, { market, concurrency: 5 });
		
		candidateIds = normalizeSpotifyIds(candidateIds);
		
		console.log("Resolved IDs:", candidateIds.length);

        if (candidateIds.length === 0) {
            renderRecommendations([]);
            drawMultiRadarChart([{ label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true }]);
            drawSimilarityBarChart([]);
            drawSimilarityScatter(seedFeatures, []);
            return;
        }

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

        if (rows.length === 0) {
            renderRecommendations([]);
            drawMultiRadarChart([{ label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true }]);
            drawSimilarityBarChart([]);
            drawSimilarityScatter(seedFeatures, []);
            return;
        }

        // Ranking songs for best visualisations
//        const reranked = rerankByAudioPlusMeta(seedFeatures, seedMeta, rows);

		const ranked = rows
			.slice()
			.sort((a, b) => b.score - a.score);
			
        const top10 = ranked.slice(0, 10);
        const top15 = ranked.slice(0, 15);

        const radarSeries = [
            { label: `Seed: ${track.name}`, id: track.id, features: seedFeatures, isSeed: true },
            ...top10.slice(0, 4).map((r) => ({
                label: r.track?.name || "Track",
                id: r.id,
                features: r.features,
                isSeed: false,
            })),
        ];

        // Render UI
		window.__seedFeatures = seedFeatures;
		
        renderRecommendations(top10, {
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


	
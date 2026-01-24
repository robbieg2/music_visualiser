// features.js

import {
    extractSpotifyIdFromHref,
    fetchReccoBeatsRecommendations,
    getManyFeaturesFromReccoBeats,
    getTrackFeaturesFromReccoBeats,
    rerankByAudioPlusMeta,
    similarityScore,
    spotifyFetch,
} from "./features-data.js";

import { drawAudioFeaturesChart, drawSimilarityBarChart, drawSimilarityScatter } from "./features-charts.js";

const trackInfo = document.getElementById("track-info");
const logoutBtn = document.getElementById("logout-btn");
const backBtn = document.getElementById("back-btn");

// Track header
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
	const vis = document.getElementById("visualisation");
	const simBar = document.getElementById("sim-bar");
	const simScatter = document.getElementById("sim-scatter");
	const recsCard = document.getElementById("recs-card");
	const noFeat = document.getElementById("no-features");
	
	if (vis) vis.innerHTML = "";
	if (simBar) simBar.innerHTML = "";
	if (simScatter) simScatter.innerHTML = "";
	if (recsCard) recsCard.style.display = "none";
	
	if (noFeat) {
		noFeat.style.display = "block";
		noFeat.innerHTML = `
			<p style="text-align:center;">
				No audio features available for this track.
				<br/>Try another song.
			</p>
		`;		
	}
}

function showVisualSections() {
	const noFeat = document.getElementById("no-features");
	const recsCard = document.getElementById("recs-card");
	
	if (noFeat) {
		noFeat.style.display = "none";
		noFeat.innerHTML = "";
	}
	
	if (recsCard) recsCard.style.display = "block";
}

// Recommendations
function renderRecommendations(spotifyIds) {
    const container = document.getElementById("recommendations");
    if (!container) return;

    container.innerHTML = "<h3>Recommended Tracks</h3>";

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "20px";
    wrapper.style.overflowX = "auto";
    wrapper.style.padding = "10px";

    spotifyIds.forEach((id) => {
        const card = document.createElement("div");
        card.style.width = "220px";
        card.style.textAlign = "center";

        card.innerHTML = `
            <iframe
                src="https://open.spotify.com/embed/track/${id}"
                width="220"
                height="120"
                frameborder="0"
                allow="encrypted-media">
            </iframe>
        `;

        wrapper.appendChild(card);
    });

    container.appendChild(wrapper);
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

    const vis = document.getElementById("visualisation");
    if (vis) vis.innerHTML = "<p style='text-align:center;'>Loading audio features</p>";

    try {
        // Seed features
        const seedFeatures = await getTrackFeaturesFromReccoBeats(track.id, token);

        if (!seedFeatures) {
			hideVisualSections();
			return;
        }
		
		showVisualSections();

        // Draw seed radar
        drawAudioFeaturesChart(track, seedFeatures);

        // Recommendations
        const recommendations = await fetchReccoBeatsRecommendations(track.id, 40);
        const recSpotifyIds = recommendations.map((r) => r.spotifyId || extractSpotifyIdFromHref(r.href)).filter(Boolean);

        const poolIds = recSpotifyIds.slice(0, 30);

        // Feature + metadata enrichment for visuals
        const recFeaturesMap = await getManyFeaturesFromReccoBeats(poolIds);
        const meta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${poolIds.join(",")}`);
        const metaMap = new Map((meta.tracks || []).filter(Boolean).map((t) => [t.id, t]));

        const rows = poolIds
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

        const seedMeta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${track.id}`);

        const reranked = rerankByAudioPlusMeta(seedFeatures, seedMeta, rows);

        const top10 = reranked.slice(0, 10);
        const top15 = reranked.slice(0, 15);

        renderRecommendations(top10.map((r) => r.id));

        // Draw both visuals
        drawSimilarityBarChart(top10);
        drawSimilarityScatter(seedFeatures, top15);
    } catch (err) {
        console.error(err);
    }
}

init();

	
// features.js

import {
    extractSpotifyIdFromHref,
    fetchReccoBeatsRecommendations,
    getManyFeaturesFromReccoBeats,
    getTrackFeaturesFromReccoBeats,
    rerankByAudioPlusMeta,
    similarityScore,
    spotifyFetch,
	uniq,
	getSeedMarket,
	getArtistTopTrackIds,
	getAlbumTrackIds,
	getYearFromReleaseDate,
	clamp01,
	popularitySimilarity,
	yearSimilarity,
	
} from "./features-data.js";

import { drawMultiRadarChart, drawSimilarityBarChart, drawSimilarityScatter } from "./features-charts.js";

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
	const noFeat = document.getElementById("no-features");
	
	const radarCard = document.getElementById("card-radar");
	const barCard = document.getElementById("card-bar");
	const scatterCard = document.getElementById("card-scatter");
	const recsCard = document.getElementById("recs-card");
	
	if (vis) vis.innerHTML = "";
	if (simBar) simBar.innerHTML = "";
	if (simScatter) simScatter.innerHTML = "";
	
	if (recsCard) recsCard.style.display = "none";
	if (scatterCard) scatterCard.style.display = "none";
	if (barCard) barCard.style.display = "none";
	
	if (radarCard) {
		radarCard.style.display = "block";
		radarCard.classList.add("centered-message");
	}
	
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
	const noFeat = document.getElementById("no-features");
	
	const radarCard = document.getElementById("card-radar");
	const barCard = document.getElementById("card-bar");
	const scatterCard = document.getElementById("card-scatter");
	const recsCard = document.getElementById("recs-card");
	
	if (recsCard) recsCard.style.display = "block";
	if (scatterCard) scatterCard.style.display = "block";
	if (barCard) barCard.style.display = "block";
	
	if (radarCard) {
		radarCard.style.dispaly = "block";
		radarCard.classList.remove("centered-message");
	}
	
	if (noFeat) {
		noFeat.style.display = "none";
		noFeat.innerHTML = "";
	}
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

        // Recommendations
		// --- OPTION A: Candidate pool from Spotify (artist + album), then rank by ReccoBeats audio similarity ---

		// Seed meta (we use it for market + artist/album ids + year/popularity rerank)
		const seedMeta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${track.id}`);
		const market = await getSeedMarket(seedMeta);

		const primaryArtistId = seedMeta?.artists?.[0]?.id || null;
		const albumId = seedMeta?.album?.id || null;

		// Build candidate ID pool
		let candidateIds = [];

		// 0) Main pool: ReccoBeats (gives variety + audio similarity)
		const recommendations = await fetchReccoBeatsRecommendations(track.id, 60);
		const recSpotifyIds = recommendations
			.map(r => r.spotifyId || extractSpotifyIdFromHref(r.href))
			.filter(Boolean);

		candidateIds.push(...recSpotifyIds);

		// 1) Sprinkle: same artist top tracks (cap it so it can't dominate)
		const SAME_ARTIST_CAP = 4;
		if (primaryArtistId) {
			const topArtist = await getArtistTopTrackIds(token, primaryArtistId, market);
			candidateIds.push(...topArtist.slice(0, SAME_ARTIST_CAP));
		}

		// 2) Sprinkle: same album tracks (smaller cap, or remove if you want)
		const SAME_ALBUM_CAP = 2;
		if (albumId) {
			const albumTracks = await getAlbumTrackIds(token, albumId);
			candidateIds.push(...albumTracks.slice(0, SAME_ALBUM_CAP));
		}

		// Clean + limit pool
		candidateIds = uniq(candidateIds).filter(id => id && id !== track.id);
		candidateIds = candidateIds.slice(0, 60);


		// Pull audio features (batch) + Spotify meta (batch)
		const recFeaturesMap = await getManyFeaturesFromReccoBeats(candidateIds);
		const meta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${candidateIds.join(",")}`);
		const metaMap = new Map((meta.tracks || []).filter(Boolean).map(t => [t.id, t]));

		// Build rows (only those with features)
		const rows = candidateIds
			.map(id => {
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
							artists: (t.artists || []).map(a => a.name),
							image: t.album?.images?.[0]?.url || "",
						}
						: { id, name: "Recommended", artists: [], image: "" },
				};
			})
			.filter(Boolean);

		// Rerank using your existing audio+meta scoring
		const reranked = rerankByAudioPlusMeta(seedFeatures, seedMeta, rows);

		const top10 = reranked.slice(0, 10);
		const top15 = reranked.slice(0, 15);

		// Radar series: seed + up to 4 of the best matches
		const radarSeries = [
			{
				label: `Seed: ${track.name}`,
				id: track.id,
				features: seedFeatures,
				isSeed: true,
			},
			...top10.slice(0, 4).map(r => ({
				label: r.track.name,
				id: r.id,
				features: r.features,
				isSeed: false,
			})),
		];

		// Render
		renderRecommendations(top10.map(r => r.id));
		drawMultiRadarChart(radarSeries);
		drawSimilarityBarChart(top10);
		drawSimilarityScatter(seedFeatures, top15);
    } catch (err) {
        console.error(err);
    }
}

init();

	
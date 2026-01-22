// features.js

const RECCOBEATS_BASE = "https://api.reccobeats.com/v1";

// Cache audio features by Spotify track ID
const audioFeatureCache = new Map();

const trackInfo = document.getElementById("track-info");
const logoutBtn = document.getElementById("logout-btn");
const backBtn = document.getElementById("back-btn");

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function extractSpotifyIdFromHref(href) {
    if (!href) return null;
    const match = href.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
}

async function spotifyFetch(token, url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify fetch failed: ${res.status} ${text}`);
    }
    return res.json();
}

// Retreive audio features from ReccoBeats
async function getTrackFeaturesFromReccoBeats(spotifyTrackId, spotifyToken = null) {
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

	//Fallback: Try to extract features if none available
/*	if (spotifyToken) {
		try {
			const track = await spotifyFetch(spotifyToken, `https://api.spotify.com/v1/tracks/${spotifyTrackId}`);
			console.log("Preview URL for fallback:", track.name, track.preview_url);
			const previewUrl = track?.preview_url;
			
			if (previewUrl) {
				const extracted = await extractAudioFeaturesFromReccoBeats(previewUrl);
				if (extracted) {
					audioFeatureCache.set(spotifyTrackId, extracted);
					return extracted;
				}
			}
		} catch (e) {
			console.warn("Fallback extraction attempt failed:", e);
		}
	}
	
	return null; */
}

async function getManyFeaturesFromReccoBeats(spotifyIds) {
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
/*
async function extractAudioFeaturesFromReccoBeats(audioUrl) {
	const endpoint = `${RECCOBEATS_BASE}/analysis/audio-features`;
	
	const res = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url: audioUrl }),
	});
	
	if (res.status === 429) {
		const retryAfter = res.headers.get("Retry-After");
		throw new Error(`Rate limited (429). Retry after: ${retryAfter || "unknown"}s`);
	}
	
	if (!res.ok) {
		const text = await res.text();
		console.warn("ReccoBeats extraction failed:", res.status, text);
		return null;
	}
	
	const data = await res.json();
	
	if (data?.content?.[0]) return data.content[0];
	if (data?.danceability != null) return data;
	
	return null;
} */

// Seed Radar chart
function drawAudioFeaturesChart(track, features) {
    const container = document.getElementById("visualisation");
    container.innerHTML = `<h2>Audio Features</h2>`;

    d3.select("#visualisation").selectAll("svg").remove();

    const data = [
        { name: "Danceability", value: Number(features.danceability) },
        { name: "Energy", value: Number(features.energy) },
        { name: "Valence", value: Number(features.valence) },
        { name: "Speechiness", value: Number(features.speechiness) },
        { name: "Acousticness", value: Number(features.acousticness) },
        { name: "Instrumental", value: Number(features.instrumentalness) },
    ].filter((d) => Number.isFinite(d.value));

    if (!data.length) {
        container.innerHTML += `<p>No usable feature values returned for this track</p>`;
        return;
    }

    const width = 420;
    const height = 420;
    const radius = Math.min(width, height) / 2 - 50;
    const levels = 5;
    const angleSlice = (Math.PI * 2) / data.length;

    const svg = d3
        .select("#visualisation")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);

    for (let level = 1; level <= levels; level++) {
        svg
            .append("circle")
            .attr("r", (radius / levels) * level)
            .style("fill", "none")
            .style("stroke", "#444");
    }

    data.forEach((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const x = rScale(1.05) * Math.cos(angle);
        const y = rScale(1.05) * Math.sin(angle);

        svg
            .append("line")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", x)
            .attr("y2", y)
            .style("stroke", "#555");

        svg
            .append("text")
            .attr("x", x)
            .attr("y", y)
            .style("fill", "#fff")
            .style("font-size", "12px")
            .style("text-anchor", "middle")
            .text(d.name);
    });

    const radarLine = d3
        .lineRadial()
        .radius((d) => rScale(d.value))
        .angle((d, i) => i * angleSlice)
        .curve(d3.curveLinearClosed);

    svg
        .append("path")
        .datum(data)
        .attr("d", radarLine)
        .style("fill", "#1db954")
        .style("fill-opacity", 0.4)
        .style("stroke", "#1db954")
        .style("stroke-width", 2);

    if (features.tempo != null) {
        container.innerHTML += `<p>Tempo: <strong>${Number(features.tempo).toFixed(1)} BPM</strong></p>`;
    }
}

// Track header
function renderTrackHeader(track) {
    const artists = (track.artists || []).join(", ");

    trackInfo.innerHTML = `
    ${track.image ? `<img src="${track.image}" width="160" height="160" style="border-radius:12px;">` : ""}
    <h1 style="margin-top:15px;">${track.name}</h1>
    <p style="opacity:0.8;">${artists}</p>

    <div style="margin-top:20px; display:flex; justify-content:center;">
      <iframe
        src="https://open.spotify.com/embed/track/${track.id}"
        width="360"
        height="80"
        frameborder="0"
        allowtransparency="true"
        allow="encrypted-media">
      </iframe>
    </div>
  `;
}

// ReccoBeats recommendations
async function fetchReccoBeatsRecommendations(spotifyTrackId, size = 20) {
    const url = new URL(`${RECCOBEATS_BASE}/track/recommendation`);
    url.searchParams.append("seeds", spotifyTrackId);
    url.searchParams.append("size", size);

    const res = await fetch(url);
	
	if (res.status === 400) {
		const text = await res.text();
		return [];
	}
	
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Recommendation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.content || [];
}

// Genre filtering through Spotify
async function getArtistsGenres(token, artistIds) {
    const map = new Map();
    const unique = [...new Set(artistIds)].filter(Boolean);

    for (const group of chunk(unique, 50)) {
        const data = await spotifyFetch(token, `https://api.spotify.com/v1/artists?ids=${group.join(",")}`);
        (data.artists || []).forEach((a) => map.set(a.id, a.genres || []));
    }
    return map;
}

async function getSeedGenres(token, seedTrackId) {
    const seedTrack = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${seedTrackId}`);
    const seedArtistIds = (seedTrack.artists || []).map((a) => a.id);

    const artistGenresMap = await getArtistsGenres(token, seedArtistIds);

    const seedGenres = [];
    seedArtistIds.forEach(id => seedGenres.push(...(artistGenresMap.get(id) || [])));
    
	const norm = normaliseGenres(seedGenres);
	
	const MAX_SEED_GENRES = 8;
	return new Set(norm.slice(0, MAX_SEED_GENRES));
}

function normaliseGenres(genres) {
	return [...new Set((genres || [])
		.map(g => String(g).toLowerCase().trim())
		.filter(Boolean)
	)];
}

function jaccardSimilarity(aList, bList) {
	const a = new Set(normaliseGenres(aList));
	const b = new Set(normaliseGenres(bList));
	if (a.size === 0 || b.size === 0) return 0;
	
	let intersection = 0;
	for (const g of a) if (b.has(g)) intersection++;

	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function getYearFromReleaseDate(dateStr) {
    if (!dateStr) return null;
    const y = Number(String(dateStr).slice(0, 4));
    return Number.isFinite(y) ? y : null;
}

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function popularitySimilarity(seedPop, recPop) {
    if (!Number.isFinite(seedPop) || !Number.isFinite(recPop)) return 0.5;
    return clamp01(1 - Math.abs(seedPop - recPop) / 100);
}

function yearSimilarity(seedYear, recYear) {
    if (!Number.isFinite(seedYear) || !Number.isFinite(recYear)) return 0.5;
    const diff = Math.min(Math.abs(seedYear - recYear), 20);
    return clamp01(1 - diff / 20);
}

function rerankByAudioPlusMeta(seedFeatures, seedMeta, rows) {
    const seedPop = Number(seedMeta?.popularity);
    const seedYear = getYearFromReleaseDate(seedMeta?.album?.release_date);

    return rows
        .map(r => {
            const recPop = Number(r.meta?.popularity);
            const recYear = getYearFromReleaseDate(r.meta?.album?.release_date);

            const audio = r.score; // your similarityScore(seedFeatures, recFeatures)
            const pop = popularitySimilarity(seedPop, recPop);
            const year = yearSimilarity(seedYear, recYear);

            const finalScore = 0.75 * audio + 0.15 * pop + 0.10 * year;

            return { ...r, finalScore, pop, year };
        })
        .sort((a, b) => b.finalScore - a.finalScore);
}
	
async function filterRecommendationsByGenre(token, seedTrackId, recSpotifyIds, keep = 10) {
    const seedGenresSet = await getSeedGenres(token, seedTrackId);
	const seedGenres = [...seedGenresSet];

    if (seedGenresSet.size === 0) return recSpotifyIds.slice(0, keep);
	
	const seedNorm = normaliseGenres(seedGenres);
	const seedSet = new Set(seedNorm);

    const tracks = [];
    for (const group of chunk(recSpotifyIds, 50)) {
        const data = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${group.join(",")}`);
        tracks.push(...(data.tracks || []).filter(Boolean));
    }

    const allArtistIds = tracks.flatMap((t) => (t.artists || []).map((a) => a.id));
    const artistGenresMap = await getArtistsGenres(token, allArtistIds);

    const scored = tracks.map((t) => {
        const trackGenres = [];
        (t.artists || []).forEach((a) => trackGenres.push(...(artistGenresMap.get(a.id) || [])));
        
		const trackNorm = normaliseGenres(trackGenres);
		
		let shared = 0;
		for (const g of trackNorm) if (seedSet.has(g)) shared++;
		
		const score = jaccardSimilarity(seedNorm, trackNorm);
		
        return {
            id: t.id,
            score,
			shared,
            genres: trackNorm,
        };
    });
	
	const MIN_SHARED = 2;
	const MIN_JACCARD = 0.12;
	
	let filtered = scored
		.filter(x => x.shared >= MIN_SHARED || x.score >= MIN_JACCARD)
		.sort((a, b) => (b.shared - a.shared) || (b.score - a.score));
		
	if (filtered.length < keep) {
		filtered = scored.sort((a, b) => (b.shared - a.shared) || (b.score - a.score));
	}
	
	console.table(filtered.slice(0, 10).map(x => ({
		id: x.id,
		shared: x.shared,
		score: x.score.toFixed(3),
		genres: x.genres.slice(0, 6).join(", ")
	})));

    return filtered.slice(0, keep).map((x) => x.id);
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

// Similarity visuals
function similarityScore(seed, rec) {
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

function drawSimilarityBarChart(rows) {
    const container = document.getElementById("sim-bar");
    if (!container) return;
    container.innerHTML = "";

    const width = 760;
    const height = 360;
    const margin = { top: 20, right: 20, bottom: 40, left: 260 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const y = d3
        .scaleBand()
        .domain(rows.map((r) => r.id))
        .range([0, innerH])
        .padding(0.15);

    g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5))
        .selectAll("text")
        .style("fill", "#fff");

    g.append("g")
        .call(
            d3.axisLeft(y).tickFormat((id) => {
                const r = rows.find((x) => x.id === id);
                const name = r?.track?.name || id;
                const artists = (r?.track?.artists || []).join(", ");
                const label = `${name} — ${artists}`;
                return label.length > 40 ? label.slice(0, 40) + "…" : label;
            })
        )
        .selectAll("text")
        .style("fill", "#fff");

    g.selectAll("rect")
        .data(rows)
        .enter()
        .append("rect")
        .attr("x", 0)
        .attr("y", (d) => y(d.id))
        .attr("width", (d) => x(d.score))
        .attr("height", y.bandwidth())
        .attr("fill", "#1db954")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            const trackParam = encodeURIComponent(JSON.stringify(d.track));
            window.location.href = `features.html?track=${trackParam}`;
        });

    g.selectAll(".score-label")
        .data(rows)
        .enter()
        .append("text")
        .attr("x", (d) => x(d.score) + 6)
        .attr("y", (d) => y(d.id) + y.bandwidth() / 2 + 4)
        .attr("fill", "#fff")
        .attr("font-size", "12px")
        .text((d) => d.score.toFixed(2));
}

function drawSimilarityScatter(seedFeatures, rows) {
    const container = document.getElementById("sim-scatter");
    if (!container) return;

    const xSel = document.getElementById("x-feature");
    const ySel = document.getElementById("y-feature");

    const width = 760;
    const height = 420;
    const margin = { top: 20, right: 20, bottom: 50, left: 60 };

    function getVal(f, key) {
        const v = Number(f?.[key]);
        return Number.isFinite(v) ? v : null;
    }

    function render() {
        container.innerHTML = "";

        const xKey = xSel?.value || "energy";
        const yKey = ySel?.value || "valence";

        const points = rows
            .map((r) => ({
                ...r,
                x: getVal(r.features, xKey),
                y: getVal(r.features, yKey),
            }))
            .filter((p) => p.x != null && p.y != null);

        const seedX = getVal(seedFeatures, xKey);
        const seedY = getVal(seedFeatures, yKey);

        const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);

        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const xDomain = d3.extent(points.map((p) => p.x));
        const yDomain = d3.extent(points.map((p) => p.y));

        if (seedX != null) {
            xDomain[0] = Math.min(xDomain[0], seedX);
            xDomain[1] = Math.max(xDomain[1], seedX);
        }
        if (seedY != null) {
            yDomain[0] = Math.min(yDomain[0], seedY);
            yDomain[1] = Math.max(yDomain[1], seedY);
        }

        const pad = (min, max) => {
            const span = max - min || 1;
            return [min - span * 0.05, max + span * 0.05];
        };

        const x = d3.scaleLinear().domain(pad(xDomain[0], xDomain[1])).range([0, innerW]);
        const y = d3.scaleLinear().domain(pad(yDomain[0], yDomain[1])).range([innerH, 0]);

        g.append("g")
            .attr("transform", `translate(0,${innerH})`)
            .call(d3.axisBottom(x).ticks(6))
            .selectAll("text")
            .style("fill", "#fff");

        g.append("g")
            .call(d3.axisLeft(y).ticks(6))
            .selectAll("text")
            .style("fill", "#fff");

        g.append("text")
            .attr("x", innerW / 2)
            .attr("y", innerH + 40)
            .attr("text-anchor", "middle")
            .attr("fill", "#fff")
            .text(xKey);

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerH / 2)
            .attr("y", -45)
            .attr("text-anchor", "middle")
            .attr("fill", "#fff")
            .text(yKey);

        // Dots
        g.selectAll("circle.rec")
            .data(points)
            .enter()
            .append("circle")
            .attr("class", "rec")
            .attr("cx", (d) => x(d.x))
            .attr("cy", (d) => y(d.y))
            .attr("r", (d) => 6 + d.score * 6)
            .attr("fill", "#1db954")
            .style("opacity", 0.75)
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                const trackParam = encodeURIComponent(JSON.stringify(d.track));
                window.location.href = `features.html?track=${trackParam}`;
            });

        // Seed marker
        if (seedX != null && seedY != null) {
            g.append("circle")
                .attr("cx", x(seedX))
                .attr("cy", y(seedY))
                .attr("r", 10)
                .attr("fill", "#fff")
                .style("opacity", 0.9);

            g.append("text")
                .attr("x", x(seedX) + 12)
                .attr("y", y(seedY) + 4)
                .attr("fill", "#fff")
                .attr("font-size", "12px")
                .text("Seed");
        }
    }

    render();
    if (xSel) xSel.addEventListener("change", render);
    if (ySel) ySel.addEventListener("change", render);
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
            const v = document.getElementById("visualisation");
            if (v) {
                v.innerHTML = `
                    <p style="text-align:center;">
                        Audio features are not available for this track.
                        <br/>Please try another song.
                    </p>
                `;
            }

            const recs = document.getElementById("recommendations");
            if (recs) recs.innerHTML = "";
            return;
        }

        // Draw seed radar
        drawAudioFeaturesChart(track, seedFeatures);

        // Recommendations
        const recommendations = await fetchReccoBeatsRecommendations(track.id, 40);

        if (!recommendations.length) {
            const recs = document.getElementById("recommendations");
            if (recs) {
                recs.innerHTML = `
                    <p style="text-align:center; opacity:0.85;">
                        No recommendations available for this track.
                    </p>
                `;
            }
            return;
        }

        const recSpotifyIds = recommendations
            .map((r) => r.spotifyId || extractSpotifyIdFromHref(r.href))
            .filter(Boolean);

        if (!recSpotifyIds.length) {
            const recs = document.getElementById("recommendations");
            if (recs) {
                recs.innerHTML = `
                    <p style="text-align:center; opacity:0.85;">
                        Recommendations returned, but no Spotify IDs were found.
                    </p>
                `;
            }
            return;
        }

        // Genre filter
        const filteredIds = await filterRecommendationsByGenre(token, track.id, recSpotifyIds, 12);

        // Feature + metadata enrichment for visuals
        const recFeaturesMap = await getManyFeaturesFromReccoBeats(filteredIds);

        const meta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${filteredIds.join(",")}`);
        const metaMap = new Map((meta.tracks || []).filter(Boolean).map((t) => [t.id, t]));

        const rows = filteredIds
            .map((id) => {
                const f = recFeaturesMap.get(id);
                if (!f) return null;

                const t = metaMap.get(id);
                const trackObj = t
                    ? {
                          id: t.id,
                          name: t.name,
                          artists: (t.artists || []).map((a) => a.name),
                          image: t.album?.images?.[0]?.url || "",
                      }
                    : { id, name: "Recommended", artists: [], image: "" };

                return {
                    id,
                    features: f,
                    score: similarityScore(seedFeatures, f),
                    track: trackObj,
					meta: t || null,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
			
		const seedMeta = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${track.id}`);
		const reranked = rerankByAudioPlusMeta(seedFeatures, seedMeta, rows);
		
		const top10 = reranked.slice(0, 10);
		const top15 = reranked.slice(0, 15);
		
		renderRecommendations(top10.map(r => r.id));

        // Draw both visuals
        drawSimilarityBarChart(rows.slice(0, 10));
        drawSimilarityScatter(seedFeatures, rows.slice(0, 15));
    } catch (err) {
        console.error(err);
    }
}

init();
	
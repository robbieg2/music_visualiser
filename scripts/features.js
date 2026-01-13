// features.js

// ReccoBeats configuration
const RECCOBEATS_BASE = "https://api.reccobeats.com/v1"
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
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Spotify fetch failed: ${res.status} ${text}`);
	}
	return res.json();
}

async function getTrackFeaturesFromReccoBeats(spotifyTrackId) {
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
  
  if (!Array.isArray(list) || list.length === 0 || !list[0]) {
    throw new Error("No audio features returned for this track id.");
  }

  const features = list[0];
  audioFeatureCache.set(spotifyTrackId, features);
  return features;
}

// Initial chart using ReccoBeats features
function drawAudioFeaturesChart(track, features) {
	const container = document.getElementById("visualisation");
	container.innerHTML = `
		<h2>Audio Features</h2>
	`;
	
	// Remove old charts
	d3.select("#visualisation").selectAll("svg").remove();
	
	const data = [
		{ name: "Danceability", value: Number(features.danceability) },
		{ name: "Energy", value: Number(features.energy) },
		{ name: "Valence", value: Number(features.valence) },
		{ name: "Speechiness", value: Number(features.speechiness) },
		{ name: "Acousticness", value: Number(features.acousticness) },
		{ name: "Instrumental", value: Number(features.instrumentalness) },
	].filter(d => Number.isFinite(d.value));
	
	if (!data.length) {
		container.innerHTML += `<p>No usable feature values returned for this track</p>`;
		return;
	}
	
	const width = 420;
	const height = 420;
	const radius = Math.min(width, height) / 2 - 50;
	const levels = 5;
	const angleSlice = (Math.PI * 2) / data.length;
	
	const svg = d3.select("#visualisation")
		.append("svg")
		.attr("width", width)
		.attr("height", height)
		.append("g")
		.attr("transform", `translate(${width / 2}, ${height / 2})`);
		
	const rScale = d3.scaleLinear()
		.domain([0, 1])
		.range([0, radius]);
		
	for (let level = 1; level <= levels; level++) {
		svg.append("circle")
			.attr("r", (radius / levels) * level)
			.style("fill", "none")
			.style("stroke", "#444");
	}
	
	data.forEach((d, i) => {
		const angle = angleSlice * i - Math.PI / 2;
		const x = rScale(1.05) * Math.cos(angle);
		const y = rScale(1.05) * Math.sin(angle);
		
		svg.append("line")
			.attr("x1", 0).attr("y1", 0)
			.attr("x2", x).attr("y2", y)
			.style("stroke", "#555");
			
		svg.append("text")
			.attr("x", x)
			.attr("y", y)
			.style("fill", "#fff")
			.style("font-size", "12px")
			.style("text-anchor", "middle")
			.text(d.name);
	});
	
	const radarLine = d3.lineRadial()
		.radius(d => rScale(d.value))
		.angle((d, i) => i * angleSlice)
		.curve(d3.curveLinearClosed);
		
	svg.append("path")
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

async function fetchReccoBeatsRecommendations(spotifyTrackId, size = 7) {
	const url = new URL("https://api.reccobeats.com/v1/track/recommendation");
	url.searchParams.append("seeds", spotifyTrackId);
	url.searchParams.append("size", size);
	
	const res = await fetch(url);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Recommendation failed: ${res.status} ${text}`);
	}
	
	const data = await res.json();
	return data.content || [];
}

async function getArtistsGenres(token, artistIds) {
	const map = new Map();
	const unique = [...new Set(artistIds)].filter(Boolean);
	
	for (const group of chunk(unique, 50)) {
		const data = await spotifyFetch(token, `https://api.spotify.com/v1/artists?ids=${group.join(",")}`);
		(data.artists || []).forEach(a => map.set(a.id, a.genres || []));
	}
	return map;
}

async function getSeedGenres(token, seedTrackId) {
	const seedTrack = await spotifyFetch(token, `https://api.spotify.com/v1/tracks/${seedTrackId}`);
	const seedArtistIds = (seedTrack.artists || []).map(a => a.id);
	
	const artistGenresMap = await getArtistsGenres(token, seedArtistIds);
	
	const seedGenres = new Set();
	seedArtistIds.forEach(id => (artistGenresMap.get(id) || []).forEach(g => seedGenres.add(g)));
	return seedGenres;
}

function genreOverlapScore(seedGenresSet, trackGenres) {
	if (!seedGenresSet || seedGenresSet.size === 0) return 0;
	if (!trackGenres || trackGenres.length === 0) return 0;
	
	let hits = 0;
	trackGenres.forEach(g => {
		if (seedGenresSet.has(g)) hits++;
	});
	
	return hits / seedGenresSet.size;
}

async function filterRecommendationsByGenre(token, seedTrackId, recSpotifyIds, keep = 8) {
	const seedGenres = await getSeedGenres(token, seedTrackId);
	
	// No genres, cannot filter reliably
	if (seedGenres.size === 0) return recSpotifyIds.slice(0, keep);
	
	// Fetch rec tracks (batch)
	const tracks = [];
	for (const group of chunk(recSpotifyIds, 50)) {
		const data = await spotifyFetch(token, `https://api.spotify.com/v1/tracks?ids=${group.join(",")}`);
		tracks.push(...(data.tracks || []).filter(Boolean));
	}
	
	// Fetch genres for all artists in recs
	const allArtistIds = tracks.flatMap(t => (t.artists || []).map(a => a.id));
	const artistGenresMap = await getArtistsGenres(token, allArtistIds);
	
	// Score each track
	const scored = tracks.map(t => {
		const genres = [];
		(t.artists || []).forEach(a => genres.push(...(artistGenresMap.get(a.id) || [])));
		const uniqueGenres = [... new Set(genres)];
		
		return {
			id: t.id,
			score: genreOverlapScore(seedGenres, uniqueGenres),
			genres: uniqueGenres,
		};
	});
	
	const filtered = scored
		.filter(x => x.score > 0)
		.sort((a, b) => b.score - a.score);
		
	if (filtered.length === 0) return recSpotifyIds.slice(0, keep);
	
	return filtered.slice(0, keep).map(x => x.id);
}
	
function renderRecommendations(spotifyIds) {
	const container = document.getElementById("recommendations");
	if (!container) return;
	
	container.innerHTML = "<h3>Recommended Tracks</h3>";
	
	const wrapper = document.createElement("div");
	wrapper.style.display = "flex";
	wrapper.style.gap = "20px";
	wrapper.style.overflowX = "auto";
	wrapper.style.padding = "10px";
	
	spotifyIds.forEach((spotifyIds) => {		
		const card = document.createElement("div");
		card.style.width = "220px";
		card.style.textAlign = "center";
		
		card.innerHTML = `
			<iframe
				src="https://open.spotify.com/embed/track/${spotifyId}"
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
	backBtn.addEventListener("click", () => window.location.href = "home.html");
	
	logoutBtn.addEventListener("click", () => {
		localStorage.removeItem("access_token");
		window.location.href = "index.html";
	});
	
	// Genre filtering token
	const token = localStorage.getItem("access_token");
	if (!token) {
		window.location.href = "index.html";
		return;
	}
	
	const params = new URLSearchParams(window.location.search);
	const trackParam = params.get("track");
	
	if(!trackParam) {
		trackInfo.innerHTML = "<p>No track provided</p>";
		return;
	}
	
	let track;
	try {
		track = JSON.parse(decodeURIComponent(trackParam));
	} catch {
		trackInfo.innerHTML = "<p>Invalid track data</p>";
		return;
	}
	
	renderTrackHeader(track);
	
	const vis = document.getElementById("visualisation");
	vis.innerHTML = "<p style='text-align:center;'>Loading audio features</p>";
	
	try {
		const features = await getTrackFeaturesFromReccoBeats(track.id);
		drawAudioFeaturesChart(track, features);
		
		const recommendations = await fetchReccoBeatsRecommendations(track.id, 20);
		
		const recSpotifyIds = recommendations
			.map(r => r.spotifyId || extractSpotifyIdFromHref(r.href))
			.filter(Boolean);
			
		const filtered = await filterRecommendationsByGenre(token, track.id, recSpotifyIds, 8);
		
		renderRecommendations(filtered);
	}catch (err) {
		console.error(err);
	}
}

init();
	
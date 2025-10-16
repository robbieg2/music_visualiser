// home.js
import { getAccessToken } from "./auth.js";

const profileSection = document.getElementById("profile");
const artistsList = document.getElementById("artists-list");
const tracksList = document.getElementById("tracks-list");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsDiv = document.getElementById("search-results");
const logoutBtn = document.getElementById("logout-btn");


async function fetchSpotifyData(token) {
	try {
		// Profile
		const profileRes = await fetch("https://api.spotify.com/v1/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const profile = await profileRes.json();
		profileSection.innerHTML = `
			<h2>Welcome, ${profile.display_name}</h2>
			${profile.images?.[0]?.url ? `<img src="${profile.images[0].url}" width="100" style="border-radius:50%;">` : ""}
		`;

		// Top artists
		const artistsRes = await fetch("https://api.spotify.com/v1/me/top/artists?limit=5", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const artists = await artistsRes.json();
		artistsList.innerHTML = "";
		if (artists.items) {
			artists.items.forEach((a) => {
				artistsList.innerHTML += `
					<div style="text-align:center;">
						<img src="${a.images?.[0]?.url || ""}" alt="${a.name}" width="120" height="120" style="border-radius:50%;">
						<p>${a.name}</p>
					</div>
				`;
			});
		}

		// Top tracks
		const tracksRes = await fetch("https://api.spotify.com/v1/me/top/tracks?limit=5", {
			headers: { Authorization: `Bearer ${token}` },
		});
		const tracks = await tracksRes.json();
		tracksList.innerHTML = "";
		if (tracks.items) {
			tracks.items.forEach((t) => {
				tracksList.innerHTML += `
					<div style="text-align:center;">
						<img src="${t.album.images?.[0]?.url || ""}" alt="${t.name}" width="120" height="120">
						<p>${t.name}</p>
						<p style="color:gray;">${t.artists.map((a) => a.name).join(", ")}</p>
					</div>
				`;
			});
		}
	} catch (err) {
		console.error("Error fetching Spotify data:", err);
		profileSection.innerHTML = `<p>Error loading your data. Please try logging in again.</p>`;
	}
}

async function searchTracks(token, query) {
	try {
		const res = await fetch(
			`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
			{
				headers: { Authorization: `Bearer ${token}` },
			}
		);
		if (!res.ok) throw new Error("Search failed");
		const data = await res.json();
		displaySearchResults(data.tracks.items);
	} catch (err) {
		console.error("Error searching tracks:", err);
		resultsDiv.innerHTML = `<p>Error searching for tracks.</p>`;
	}
}

function displaySearchResults(tracks) {
	const resultsDiv = document.getElementById("search-results");
	resultsDiv.innerHTML = "";
	
	if (!tracks || !tracks.length) {
		resultsDiv.innerHTML = "<p>No results found.</p>";
		return;
	}

	tracks.forEach((track) => {
		const div = document.createElement("div");
		div.className = "track-result";
		div.style.margin = "10px";
		div.style.textAlign = "center";
		div.style.width = "270px";

		div.innerHTML = `
			<img src="${track.album.images[0]?.url}" width="120" height="120" style+"border-radius:10px"><br/>
			<strong>${track.name}</strong><br/>
			<em>${track.artists.map((a) => a.name).join(", ")}</em><br><br/>
			<iframe src="https://open.spotify.com/embed/track/${track.id}"
					width="270" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media">
			</iframe>
		`;

		resultsDiv.appendChild(div);
	});
}

async function init() {
	let token = localStorage.getItem("access_token");

	if (!token) {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get("code")) {
			token = await getAccessToken();
		}
		if (!token) {
			window.location.href = "index.html";
			return;
		}
	}

	await fetchSpotifyData(token);

	// Search button
	searchBtn.addEventListener("click", () => {
		const query = searchInput.value.trim();
		if (query) searchTracks(token, query);
	});

	// Logout
	logoutBtn.addEventListener("click", () => {
		localStorage.removeItem("access_token");
		window.location.href = "index.html";
	});
}

init();


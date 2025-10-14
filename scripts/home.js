// home.js
import { getAccessToken } from "./auth.js";

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsDiv = document.getElementById("search-results");
const profileSection = document.getElementById("profile");

async function fetchUserProfile(token) {
	const res = await fetch("https://api.spotify.com/v1/me", {
		headers: { Authorization: `Bearer ${token}` },
	});
	const profile = await res.json();
	profileSection.innerHTML = `<h2>Welcome, ${profile.display_name}</h2>`;
}

async function searchTracks(token, query) {
	const res = await fetch(
		`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
		{
			headers: { Authorization: `Bearer ${token}` },
		}
	);

	if (!res.ok) {
		const errText = await res.text();
		console.error("Search failed:", res.status, errText);
		resultsDiv.innerHTML = `<p>Error searching tracks: ${res.status}</p>`;
		return;
	}

	const data = await res.json();
	displaySearchResults(data.tracks.items);
}

function displaySearchResults(tracks) {
	resultsDiv.innerHTML = "";

	if (!tracks.length) {
		resultsDiv.innerHTML = "<p>No results found.</p>";
		return;
	}

	tracks.forEach((track) => {
		const div = document.createElement("div");
		div.className = "track-result";
		
		const hasPreview = !!track.preview_url;
		
		div.innerHTML = `
			<img src="${track.album.images[0]?.url}" width="64" height="64" />
			<strong>${track.name}</strong><br/>
			<em>${track.artists.map((a) => a.name).join(", ")}</em><br/>
			${hasPreview ? "<button class='preview-btn'>▶ Preview</button>" : "<p><em>No preview available</em></p"}
		`;

		resultsDiv.appendChild(div);
		
		if (hasPreview) {
			const previewBtn = div.querySelector(".preview-btn");
			const audio = new Audio(track.preview_url);
			
			previewBtn.addEventListener("click", () => {
				if (!audio.paused) {
					audio.pause();
					previewBtn.textContent = "▶ Preview";
				} else {
					document.querySelectorAll("audio").forEach((a) => a.pause());
					audio.play();
					previewBtn. textContent = "▶ Pause";
					audio.onended = () => (previewBtn.textContent = "▶ Preview");
				}
			});
			
			div.appendChild(audio);
		}
		
		div.querySelector("img").addEventListener("click", () => showTrackFeatures(track.id));

		div.addEventListener("click", () => showTrackFeatures(track.id));
	});
}

async function init() {
	const token = localStorage.getItem("access_token") || await getAccessToken();
	if (!token) {
		window.location.href = "index.html"; // redirect if not logged in
		return;
	}

	await fetchUserProfile(token);

	searchBtn.addEventListener("click", () => {
		const query = searchInput.value.trim();
		if (query) searchTracks(token, query);
	});
}

init();

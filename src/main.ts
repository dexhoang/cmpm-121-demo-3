//imports
import leaflet from "leaflet";
import luck from "./luck.ts";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";

//set constant values
const mapCenter = leaflet.latLng(36.98949379578401, -122.06277128548504);
const zoomLevel = 19;
const tileSizeDegrees = 1e-4;
const cacheNeighborhoodSize = 8;
const cacheSpawnRate = 0.1;

//game variables
const playerPoints = 0;
let playerInventory = 0;

//dictionary to hold cache coin values
const cacheValues: Record<string, number> = {};

//display for player points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

//function creates map
function CreateMap(): leaflet.Map {
  const map = leaflet.map(document.getElementById("map")!, {
    center: mapCenter,
    zoom: zoomLevel,
    minZoom: zoomLevel,
    maxZoom: zoomLevel,
    zoomControl: false,
    scrollWheelZoom: true,
  });

  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  return map;
}

//adds player marker
function InitializePlayer(map: leaflet.Map) {
  const player = leaflet.marker(mapCenter);
  player.bindTooltip("You are Here!");
  player.addTo(map);
  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory} coins`;
}

//spawns cache near player's neighborhood
function SpawnCacheMarkers(map: leaflet.Map) {
  for (let i = -cacheNeighborhoodSize; i < cacheNeighborhoodSize; i++) {
    for (let j = -cacheNeighborhoodSize; j < cacheNeighborhoodSize; j++) {
      if (luck([i, j].toString()) < cacheSpawnRate) {
        AddCacheMarker(map, i, j);
      }
    }
  }
}

function AddCacheMarker(map: leaflet.Map, i: number, j: number) {
  const bounds = CalculateCacheBounds(i, j);
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  BindCachePopup(rect, i, j);
}

//returns bounds for cache
function CalculateCacheBounds(i: number, j: number): leaflet.latLngBounds {
  const origin = mapCenter;
  return leaflet.latLngBounds([
    [origin.lat + i * tileSizeDegrees, origin.lng + j * tileSizeDegrees],
    [
      origin.lat + (i + 1) * tileSizeDegrees,
      origin.lng + (j + 1) * tileSizeDegrees,
    ],
  ]);
}

//binds popup to a cache, allow for player withdraw/deposit coins
function BindCachePopup(rect: leaflet.Rectangle, i: number, j: number) {
  const cacheKey = `${i},${j}`;

  if (!(cacheKey in cacheValues)) {
    cacheValues[cacheKey] = Math.floor(luck([i, j, "value"].toString()) * 100);
  }

  rect.bindPopup(() => {
    let cacheValue = cacheValues[cacheKey];

    const popupDiv = document.createElement("div");
    popupDiv.innerHTML =
      `<div>Cache at "${i},${j}" with <span id="cache-value">${cacheValue}</span> coins.</div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    popupDiv.querySelector("#collect")!.addEventListener("click", () => {
      if (cacheValue > 0) {
        playerInventory++;
        cacheValue--;
        cacheValues[cacheKey] = cacheValue; // Update stored cache value
        statusPanel.innerHTML =
          `${playerPoints} points | Inventory: ${playerInventory} coins`;
        popupDiv.querySelector("#cache-value")!.textContent = cacheValue
          .toString();
      }
    });

    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerInventory > 0) {
        playerInventory--;
        cacheValue++;
        cacheValues[cacheKey] = cacheValue; // Update stored cache value
        statusPanel.innerHTML =
          `${playerPoints} points | Inventory: ${playerInventory} coins`;
        popupDiv.querySelector("#cache-value")!.textContent = cacheValue
          .toString();
      }
    });

    return popupDiv;
  });
}

//starts game
function CreateGame() {
  const map = CreateMap();
  InitializePlayer(map);
  SpawnCacheMarkers(map);
}

CreateGame();

//momento pattern
interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  i: number;
  j: number;
  numCoins: number;

  constructor(i: number, j: number, numCoins: number) {
    this.i = i;
    this.j = j;
    this.numCoins = numCoins;
  }

  toMomento(): string {
    return JSON.stringify({ i: this.i, j: this.j, numCoins: this.numCoins });
  }

  fromMomento(momento: string): void {
    const { i, j, numCoins } = JSON.parse(momento);
    this.i = i;
    this.j = j;
    this.numCoins = numCoins;
  }
}

//imports
import leaflet from "leaflet";
import luck from "./luck.ts";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import { Board, type Cell } from "./board.ts";

//set constant values
const mapCenter = leaflet.latLng(36.98949379578401, -122.06277128548504);
const zoomLevel = 19;
const tileSizeDegrees = 1e-4;
const cacheNeighborhoodSize = 8;
const cacheSpawnRate = 0.1;
const playerMovement = 1e-4;
const playerPoints = 0;

//game variables
let playerPosition = mapCenter;
let playerMarker: leaflet.Marker;
let map: leaflet.Map;
let board: Board;

//display for player points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

//keeps track of coins/inventory/caches
const coinInCache: Record<string, { i: number; j: number; serial: number }[]> =
  {};
const playerInventory: { i: number; j: number; serial: number }[] = [];
const cacheState: Record<string, string> = {};

//starts game
function CreateGame() {
  map = CreateMap();
  board = new Board(tileSizeDegrees, cacheNeighborhoodSize);
  InitializePlayer(map);
  SpawnCacheMarkers(map, board);
}

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
  playerMarker = leaflet.marker(mapCenter);
  playerMarker.bindTooltip("You are Here!");
  playerMarker.addTo(map);

  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory}`;
}

function InitializeCacheCoins(cell: Cell, coinCount: number) {
  const cacheKey = `${cell.i},${cell.j}`;
  if (!(cacheKey in coinInCache)) {
    coinInCache[cacheKey] = [];
    for (let serial = 0; serial < coinCount; serial++) {
      coinInCache[cacheKey].push({
        i: cell.i,
        j: cell.j,
        serial,
      });
    }
  }
}

//spawns cache near player's neighborhood
function SpawnCacheMarkers(map: leaflet.Map, board: Board) {
  //removes rectangles from map
  map.eachLayer((layer: leaflet.Layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });

  const cells = board.getCellsNearPoint(playerPosition);
  const visibleCaches = new Set();

  for (const cell of cells) {
    const cacheKey = `${cell.i},${cell.j}`;
    visibleCaches.add(cacheKey);

    //restores caches from momento, otherwise create new cache
    if (cacheState[cacheKey]) {
      const geoCache = new Geocache(0, 0, 0);
      geoCache.fromMomento(cacheState[cacheKey]);
      AddCacheMarker(map, board, cell);
    } else if (luck(cacheKey) < cacheSpawnRate) {
      AddCacheMarker(map, board, cell);

      const geoCache = new Geocache(
        cell.i,
        cell.j,
        Math.floor(luck(`${cell.i},${cell.j},value`) * 20),
      );
      cacheState[cacheKey] = geoCache.toMomento();
    }
  }

  //saves states for caches out of range
  for (const cacheKey in cacheState) {
    if (!visibleCaches.has(cacheKey)) {
      const cell = cacheKey.split(",").map(Number);
      const geocache = new Geocache(cell[0], cell[1], 0);
      geocache.fromMomento(cacheState[cacheKey]);
      cacheState[cacheKey] = geocache.toMomento();
    }
  }
}

function AddCacheMarker(map: leaflet.Map, board: Board, cell: Cell) {
  const bounds = board.getCellBounds(cell);
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  const coinCount = Math.floor(luck(`${cell.i},${cell.j},value`) * 20);
  InitializeCacheCoins(cell, coinCount);

  BindCachePopup(rect, cell);
}

//binds popup to a cache, allow for player withdraw/deposit coins
function BindCachePopup(rect: leaflet.Rectangle, cell: Cell) {
  const cacheKey = `${cell.i},${cell.j}`;
  const cacheCoins = coinInCache[cacheKey] || [];

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<div>Cache at "${cell.i},${cell.j}"</div>
      <div>Inventory:</div>
      <ul>${
      cacheCoins.map((coin) => `<li>${coin.i}: ${coin.j} #${coin.serial}</li>`)
        .join("")
    }</ul>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    //updates cache inventory when player collects from cache
    popupDiv.querySelector("#collect")!.addEventListener("click", () => {
      if (cacheCoins.length > 0) {
        const collectedCoin = cacheCoins.shift();
        if (collectedCoin) {
          playerInventory.push(collectedCoin);
          UpdateInventory();
          UpdateCacheState(cacheKey);

          //refreshes popup
          rect.closePopup();
          rect.unbindPopup();
          BindCachePopup(rect, cell);
          rect.openPopup();
        }
      }
    });

    //updates cache inventory when player deposits to cache
    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerInventory.length > 0) {
        const depositedCoin = playerInventory.shift();
        if (depositedCoin) {
          cacheCoins.push(depositedCoin);
          UpdateInventory();
          UpdateCacheState(cacheKey);

          rect.closePopup();
          rect.unbindPopup();
          BindCachePopup(rect, cell);
          rect.openPopup();
        }
      }
    });

    return popupDiv;
  });
}

//updates caches when coins are collected/deposited
function UpdateCacheState(cacheKey: string) {
  const [i, j] = cacheKey.split(",").map(Number);
  const geocache = new Geocache(i, j, coinInCache[cacheKey]?.length || 0);
  cacheState[cacheKey] = geocache.toMomento();
}

//updates inventory values
function UpdateInventory() {
  const inventoryList = playerInventory.map((coin) =>
    `${coin.i}: ${coin.j} #${coin.serial}`
  ).join("<br>");

  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory.length} coins
    <div><br>${inventoryList}</div>`;
}

//add listener events for buttons to move player/map and generate new caches
const northButton = document.getElementById("north");
northButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat + playerMovement,
    playerPosition.lng,
  );
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);
  SpawnCacheMarkers(map, board);
});

const southButton = document.getElementById("south");
southButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat - playerMovement,
    playerPosition.lng,
  );
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);
  SpawnCacheMarkers(map, board);
});

const eastButton = document.getElementById("east");
eastButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat,
    playerPosition.lng + playerMovement,
  );
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);
  SpawnCacheMarkers(map, board);
});

const westButton = document.getElementById("west");
westButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat,
    playerPosition.lng - playerMovement,
  );
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);
  SpawnCacheMarkers(map, board);
});

CreateGame();

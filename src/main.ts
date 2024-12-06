//momento pattern
interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

//geocache
class Geocache implements Momento<string> {
  i: number;
  j: number;
  coins: { serial: number; i: number; j: number }[];

  constructor(
    i: number,
    j: number,
    coins: { serial: number; i: number; j: number }[],
  ) {
    this.i = i;
    this.j = j;
    this.coins = coins;
  }

  toMomento(): string {
    return JSON.stringify({ i: this.i, j: this.j, coins: this.coins });
  }

  fromMomento(momento: string): void {
    const { i, j, coins } = JSON.parse(momento);
    this.i = i;
    this.j = j;
    this.coins = coins;
  }
}

//game state interface to save/load
interface GameState {
  playerPosition: { lat: number; lng: number };
  playerPoints: number;
  playerInventory: { i: number; j: number; serial: number }[];
  cacheState: Record<string, string>;
  playerPath: leaflet.latLng[];
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

//game variables
let playerPosition = mapCenter;
let playerMarker: leaflet.Marker;
let map: leaflet.Map;
let board: Board;
let playerPoints = 0;
let playerPolyline: leaflet.Polyline;
let sensorInterval: number | null = null;

//display for player points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

//keeps track of coins/inventory/caches/path history
let coinInCache: Record<string, { i: number; j: number; serial: number }[]> =
  {};
// deno-lint-ignore prefer-const
let playerInventory: { i: number; j: number; serial: number }[] = [];
const cacheState: Record<string, string> = {};
const playerPath: leaflet.latLng[] = [];

//starts game
function CreateGame() {
  map = CreateMap();
  board = new Board(tileSizeDegrees, cacheNeighborhoodSize);

  //checks if there is a saved game state
  if (!LoadGameState()) {
    playerPath.push(playerPosition);
    SpawnCacheMarkers(map, board, cacheState);
    InitializePlayer(map);
  } else {
    playerMarker = leaflet.marker(playerPosition);
    playerMarker.bindTooltip("You Are Here");
    playerMarker.addTo(map);
    map.setView(playerPosition);
    playerPath.push(playerPosition);
    statusPanel.innerHTML =
      `${playerPoints} points | Inventory: ${playerInventory.length} coins`;
    SpawnCacheMarkers(map, board, cacheState);
  }
}

//creates map using constant values
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

//#region Player Functions
//adds player marker
function InitializePlayer(map: leaflet.Map) {
  playerMarker = leaflet.marker(mapCenter);
  playerMarker.bindTooltip("You are Here!");
  playerMarker.addTo(map);
  playerPath.push(playerPosition);
  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory}`;
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

//draw player path
function updatePlayerPath() {
  //push position to path array
  playerPath.push(playerPosition);

  if (playerPolyline) {
    map.removeLayer(playerPolyline);
  }

  //create line and add it to map
  playerPolyline = leaflet.polyline(playerPath, {
    color: "red",
    weight: 3,
  });
  playerPolyline.addTo(map);
}
//#endregion

//#region Cache Functions
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
function SpawnCacheMarkers(
  map: leaflet.Map,
  board: Board,
  cacheState: Record<string, string>,
) {
  // Removes rectangles from the map
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

    //restores cache, otherwise creates cache
    if (cacheState[cacheKey]) {
      const geoCache = new Geocache(0, 0, []);
      geoCache.fromMomento(cacheState[cacheKey]);
      coinInCache[cacheKey] = [...geoCache.coins];
      AddCacheMarker(map, board, cell, cacheState);
    } else if (luck(cacheKey) < cacheSpawnRate) {
      const coins = [];
      const coinCount = Math.floor(luck(`${cell.i},${cell.j},value`) * 20);

      for (let serial = 0; serial < coinCount; serial++) {
        coins.push({ i: cell.i, j: cell.j, serial });
      }

      const geoCache = new Geocache(cell.i, cell.j, coins);
      coinInCache[cacheKey] = coins;
      cacheState[cacheKey] = geoCache.toMomento();
      AddCacheMarker(map, board, cell, cacheState);
    }
  }

  //save states for caches out of range
  for (const cacheKey in cacheState) {
    if (!visibleCaches.has(cacheKey)) {
      const geocache = new Geocache(0, 0, []);
      geocache.fromMomento(cacheState[cacheKey]);
      cacheState[cacheKey] = geocache.toMomento();
    }
  }
}

function AddCacheMarker(
  map: leaflet.Map,
  board: Board,
  cell: Cell,
  cacheState: Record<string, string>,
) {
  const bounds = board.getCellBounds(cell);
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  const coinCount = Math.floor(luck(`${cell.i},${cell.j},value`) * 20);

  InitializeCacheCoins(cell, coinCount);
  BindCachePopup(rect, cell, cacheState);
}

//binds popup to a cache, allow for player withdraw/deposit coins
function BindCachePopup(
  rect: leaflet.Rectangle,
  cell: Cell,
  cacheState: Record<string, string>,
) {
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
          BindCachePopup(rect, cell, cacheState);
          rect.openPopup();

          saveGameState();
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
          BindCachePopup(rect, cell, cacheState);
          rect.openPopup();

          saveGameState();
        }
      }
    });
    return popupDiv;
  });
}

//updates caches when coins are collected/deposited
function UpdateCacheState(cacheKey: string) {
  const [i, j] = cacheKey.split(",").map(Number);
  const geocache = new Geocache(i, j, coinInCache[cacheKey] || []);
  cacheState[cacheKey] = geocache.toMomento();
}
//#endregion

//#region Button Listener Events
//add listener events for buttons to move player/map, generate new caches, update polyline, and save game state
const northButton = document.getElementById("north");
northButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat + playerMovement,
    playerPosition.lng,
  );

  UpdatePlayerView();
  SpawnCacheMarkers(map, board, cacheState);
  updatePlayerPath();
  saveGameState();
});

const southButton = document.getElementById("south");
southButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat - playerMovement,
    playerPosition.lng,
  );

  UpdatePlayerView();
  SpawnCacheMarkers(map, board, cacheState);
  updatePlayerPath();
  saveGameState();
});

const eastButton = document.getElementById("east");
eastButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat,
    playerPosition.lng + playerMovement,
  );

  UpdatePlayerView();
  SpawnCacheMarkers(map, board, cacheState);
  updatePlayerPath();
  saveGameState();
});

const westButton = document.getElementById("west");
westButton?.addEventListener("click", () => {
  playerPosition = leaflet.latLng(
    playerPosition.lat,
    playerPosition.lng - playerMovement,
  );

  UpdatePlayerView();
  SpawnCacheMarkers(map, board, cacheState);
  updatePlayerPath();
  saveGameState();
});

const sensorButton = document.getElementById("sensor");
sensorButton?.addEventListener("click", () => {
  if (sensorInterval === null) {
    GrabPlayerLocation();
    SpawnCacheMarkers(map, board, cacheState);
    sensorButton.style.backgroundColor = "black";
  }
  if (sensorInterval === null) {
    sensorInterval = globalThis.setInterval(() => {
      GrabPlayerLocation();
      SpawnCacheMarkers(map, board, cacheState);
      sensorButton.style.backgroundColor = "black";
    }, 3000);
  } else {
    clearInterval(sensorInterval);
    sensorInterval = null;
    sensorButton.style.backgroundColor = "";
  }
});

const resetButton = document.getElementById("reset");
resetButton?.addEventListener("click", () => {
  const resetPrompt = prompt("Type in 'reset' to confirm: ");
  if (resetPrompt == "reset" || resetPrompt == "Reset") {
    ResetGame();
  } else {
    alert("You did not type in 'reset'. Reset request is denied.");
  }
});
//#endregion

//#region Geolocation
//gets player location
function GrabPlayerLocation() {
  if ("geolocation" in navigator) {
    getPosition()
      .then((position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        playerPosition = leaflet.latLng(latitude, longitude);
        UpdatePlayerView();
      })
      .catch((error) => {
        console.error("Error getting geolocation:", error);
      });
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}

// updates the player marker position and recenters the map to the player
function UpdatePlayerView() {
  if (playerMarker) {
    playerMarker.setLatLng(playerPosition);
    playerMarker.bindTooltip("You Are Here");
  }

  if (map) {
    map.setView(playerPosition);
  }
}
//#endregion

//#region Save/Load/Reset Game State
//creates game state and sets it in local storage
function saveGameState() {
  const gameState: GameState = {
    playerPosition: { lat: playerPosition.lat, lng: playerPosition.lng },
    playerPoints,
    playerInventory,
    cacheState,
    playerPath,
  };

  playerPath.push(playerPosition);
  localStorage.setItem("gameState", JSON.stringify(gameState));
}

//loads saved game state if any and assigns values to variables
function LoadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const gameState: GameState = JSON.parse(savedState);
    playerPosition = leaflet.latLng(
      gameState.playerPosition.lat,
      gameState.playerPosition.lng,
    );
    playerPoints = gameState.playerPoints;
    playerInventory.splice(
      0,
      playerInventory.length,
      ...gameState.playerInventory,
    );
    Object.assign(cacheState, gameState.cacheState);

    // Reconstruct coinInCache from cacheState
    for (const cacheKey in cacheState) {
      const { coins } = JSON.parse(cacheState[cacheKey]);
      coinInCache[cacheKey] = coins; // Restore coin details
    }

    playerPath.splice(0, playerPath.length, ...gameState.playerPath);
    updatePlayerPath();
    return true;
  }
  return false;
}

//resets the game's state
function ResetGame() {
  // Reset player position, inventory, and polyline
  playerPosition = mapCenter;
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);

  playerInventory.length = 0;
  playerPoints = 0;
  UpdateInventory();

  playerPath.length = 0;
  if (playerPolyline) {
    map.removeLayer(playerPolyline);
  }

  // Clear caches and reset cache state
  coinInCache = {}; // Clear all coins
  Object.keys(cacheState).forEach((key) => delete cacheState[key]); // Clear cache state

  SpawnCacheMarkers(map, board, cacheState); // Regenerate caches and coins
  localStorage.removeItem("gameState");
  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory.length} coins`;
  playerPath.push(playerPosition);
}

//#endregion

CreateGame();

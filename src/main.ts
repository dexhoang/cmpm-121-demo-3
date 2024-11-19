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

//game variables
const playerPoints = 0;

//display for player points
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

//keeps track of coins/inventory
const coinInCache: Record<string, { i: number; j: number; serial: number }[]> =
  {};
const playerInventory: { i: number; j: number; serial: number }[] = [];

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
  const cells = board.getCellsNearPoint(mapCenter);
  for (const cell of cells) {
    if (luck(`${cell.i},${cell.j}`) < cacheSpawnRate) {
      AddCacheMarker(map, board, cell);
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
    const coinList = cacheCoins.map((coin) =>
      `<li>${coin.i}: ${coin.j} #${coin.serial}</li>`
    ).join("");

    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<div>Cache at "${cell.i},${cell.j}"</div>
      <div>Inventory:</div>
      <ul>${coinList}</ul>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    popupDiv.querySelector("#collect")!.addEventListener("click", () => {
      if (cacheCoins.length > 0) {
        const collectedCoin = cacheCoins.shift();

        if (collectedCoin) {
          playerInventory.push(collectedCoin);
          console.log("Collected coin: ", collectedCoin);

          UpdateInventory();

          popupDiv.querySelector("ul")!.innerHTML = cacheCoins.map((coin) =>
            `<li>${coin.i}: ${coin.j} #${coin.serial}</li>`
          ).join("");
        }
      }
    });

    popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
      if (playerInventory.length > 0) {
        const depositedCoin = playerInventory.shift();

        if (depositedCoin) {
          cacheCoins.push(depositedCoin);
          console.log("Deposited coin:", depositedCoin);

          UpdateInventory();

          popupDiv.querySelector("ul")!.innerHTML = cacheCoins.map((coin) =>
            `<li>${coin.i}: ${coin.j} #${coin.serial}</li>`
          ).join("");
        }
      }
    });

    return popupDiv;
  });
}

function UpdateInventory() {
  const inventoryList = playerInventory.map((coin) =>
    `${coin.i}: ${coin.j} #${coin.serial}`
  ).join("<br>");

  statusPanel.innerHTML =
    `${playerPoints} points | Inventory: ${playerInventory.length} coins
    <div><br>${inventoryList}</div>`;
}

//starts game
function CreateGame() {
  const map = CreateMap();
  const board = new Board(tileSizeDegrees, cacheNeighborhoodSize);
  InitializePlayer(map);
  SpawnCacheMarkers(map, board);
}

CreateGame();

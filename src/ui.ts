import type { RoomPlayers, Seat, MoveRecord } from "./db";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface StatusInput {
  connected: boolean;
  opponentEverPresent: boolean;
  mySeat: Seat | null;
  players: RoomPlayers;
  fen: string;
  result: string | null;
  history: MoveRecord[];
}

type ConnState = "connecting" | "connected" | "gone";

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

let statusEl: HTMLElement | null = null;
let connDotEl: HTMLElement | null = null;
let connTextEl: HTMLElement | null = null;
let whiteRowEl: HTMLElement | null = null;
let blackRowEl: HTMLElement | null = null;
let whiteNameEl: HTMLElement | null = null;
let blackNameEl: HTMLElement | null = null;
let gameStatusEl: HTMLElement | null = null;
let moveListEl: HTMLElement | null = null;
let resetBtnEl: HTMLButtonElement | null = null;
let resetHandler: (() => void) | null = null;

export function mountStatus(container: HTMLElement): void {
  statusEl = document.createElement("div");
  statusEl.className = "status";

  // 连接状态
  const connRow = document.createElement("div");
  connRow.className = "conn-row";
  connDotEl = document.createElement("span");
  connDotEl.className = "conn-dot connecting";
  connTextEl = document.createElement("span");
  connTextEl.className = "conn-text";
  connTextEl.textContent = "连接中…";
  connRow.append(connDotEl, connTextEl);

  // 双方信息
  const playersEl = document.createElement("div");
  playersEl.className = "players";

  whiteRowEl = document.createElement("div");
  whiteRowEl.className = "player-row";
  whiteRowEl.dataset.seat = "white";
  const whiteDot = document.createElement("span");
  whiteDot.className = "player-dot dot-white";
  whiteNameEl = document.createElement("span");
  whiteNameEl.className = "player-name";
  whiteRowEl.append(whiteDot, whiteNameEl);

  blackRowEl = document.createElement("div");
  blackRowEl.className = "player-row";
  blackRowEl.dataset.seat = "black";
  const blackDot = document.createElement("span");
  blackDot.className = "player-dot dot-black";
  blackNameEl = document.createElement("span");
  blackNameEl.className = "player-name";
  blackRowEl.append(blackDot, blackNameEl);

  playersEl.append(whiteRowEl, blackRowEl);

  // 对局状态
  gameStatusEl = document.createElement("div");
  gameStatusEl.className = "game-status";

  // 着法列表
  moveListEl = document.createElement("div");
  moveListEl.className = "move-list";

  // 再来一局
  const resetRow = document.createElement("div");
  resetRow.className = "reset-row";
  resetBtnEl = document.createElement("button");
  resetBtnEl.type = "button";
  resetBtnEl.className = "reset-btn";
  resetBtnEl.textContent = "再来一局";
  resetBtnEl.addEventListener("click", () => resetHandler?.());
  resetRow.appendChild(resetBtnEl);

  statusEl.append(connRow, playersEl, gameStatusEl, moveListEl, resetRow);
  container.appendChild(statusEl);
}

export function setResetHandler(cb: () => void): void {
  resetHandler = cb;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function opponentSeat(mySeat: Seat | null): Seat | null {
  if (mySeat === "white") return "black";
  if (mySeat === "black") return "white";
  return null;
}

function connState(input: StatusInput): ConnState {
  if (!input.connected) return "connecting";
  const opp = opponentSeat(input.mySeat);
  if (opp) {
    const oppTaken = input.players[opp] !== null;
    if (!oppTaken && input.opponentEverPresent) return "gone";
  }
  return "connected";
}

function seatLabel(seat: Seat, taken: boolean, mine: boolean): string {
  if (mine) return seat === "white" ? "白方 · 你" : "黑方 · 你";
  if (taken) return seat === "white" ? "白方 · 对方" : "黑方 · 对方";
  return seat === "white" ? "白方 · 等待加入…" : "黑方 · 等待加入…";
}

function gameStatusText(input: StatusInput): string {
  // 对局已结束
  if (input.result) {
    if (input.result === "白方胜") return input.mySeat === "white" ? "你赢了 🎉" : "你输了";
    if (input.result === "黑方胜") return input.mySeat === "black" ? "你赢了 🎉" : "你输了";
    return "和棋";
  }

  // 观众
  if (input.mySeat === null) {
    return "你是观众，等有空位后刷新加入";
  }

  const opp = opponentSeat(input.mySeat);
  const oppPresent = opp ? input.players[opp] !== null : false;

  if (!oppPresent) {
    return input.opponentEverPresent ? "对方已离开，等待重连…" : "等待对方加入…";
  }

  // 谁该走子
  const turn = input.fen.split(" ")[1] ?? "w";
  const myColor = input.mySeat === "white" ? "w" : "b";
  return turn === myColor ? "轮到你走子" : "等待对方走子…";
}

function renderMoveList(history: MoveRecord[]): void {
  if (!moveListEl) return;
  moveListEl.textContent = "";

  const recent = history.slice(-20);
  const pairCount = Math.ceil(recent.length / 2);

  for (let i = 0; i < pairCount; i++) {
    const first = recent[i * 2];
    const second = recent[i * 2 + 1];

    const pair = document.createElement("div");
    pair.className = "move-pair";

    const no = document.createElement("span");
    no.className = "move-no";
    no.textContent = `${i + 1}.`;

    const s1 = document.createElement("span");
    s1.className = "move-san";
    s1.textContent = first?.san ?? "";

    const s2 = document.createElement("span");
    s2.className = "move-san";
    s2.textContent = second?.san ?? "";

    pair.append(no, s1, s2);
    moveListEl.appendChild(pair);
  }

  moveListEl.scrollTop = moveListEl.scrollHeight;
}

export function renderStatus(input: StatusInput): void {
  if (!statusEl) return;

  const conn = connState(input);
  if (connDotEl) {
    connDotEl.className = `conn-dot ${conn}`;
    connDotEl.title = conn === "connecting" ? "连接中" : conn === "connected" ? "已连接" : "对方离开";
  }
  if (connTextEl) {
    connTextEl.textContent =
      conn === "connecting" ? "连接中…" : conn === "connected" ? "已连接" : "对方已离开";
  }

  if (whiteNameEl) {
    whiteNameEl.textContent = seatLabel("white", input.players.white !== null, input.mySeat === "white");
  }
  if (blackNameEl) {
    blackNameEl.textContent = seatLabel("black", input.players.black !== null, input.mySeat === "black");
  }
  if (whiteRowEl) {
    whiteRowEl.classList.toggle("me", input.mySeat === "white");
  }
  if (blackRowEl) {
    blackRowEl.classList.toggle("me", input.mySeat === "black");
  }

  if (gameStatusEl) {
    gameStatusEl.textContent = gameStatusText(input);
  }

  renderMoveList(input.history);

  if (resetBtnEl) {
    resetBtnEl.style.display = input.mySeat === "white" ? "" : "none";
  }
}

import wK from "./assets/pieces/wK.svg";
import wQ from "./assets/pieces/wQ.svg";
import wR from "./assets/pieces/wR.svg";
import wB from "./assets/pieces/wB.svg";
import wN from "./assets/pieces/wN.svg";
import wP from "./assets/pieces/wP.svg";
import bK from "./assets/pieces/bK.svg";
import bQ from "./assets/pieces/bQ.svg";
import bR from "./assets/pieces/bR.svg";
import bB from "./assets/pieces/bB.svg";
import bN from "./assets/pieces/bN.svg";
import bP from "./assets/pieces/bP.svg";

const PIECE_URLS: Record<string, string> = {
  K: wK,
  Q: wQ,
  R: wR,
  B: wB,
  N: wN,
  P: wP,
  k: bK,
  q: bQ,
  r: bR,
  b: bB,
  n: bN,
  p: bP,
};

/** 统一的棋子图标（返回 SVG 资源地址；UI 层只管调用它） */
export function pieceIcon(piece: string): string {
  return PIECE_URLS[piece] ?? "";
}

export type PieceColor = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface BoardRender {
  fen: string;
  orientation: PieceColor;
  selected: string | null;
  legalTargets: string[];
  captureTargets: string[];
  lastFrom: string | null;
  lastTo: string | null;
  checkSquare: string | null;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

let boardEl: HTMLElement | null = null;
let squareEls = new Map<string, HTMLElement>();
let clickHandler: ((square: string) => void) | null = null;

export function mountBoard(container: HTMLElement): void {
  boardEl = document.createElement("div");
  boardEl.className = "board";
  boardEl.style.gridTemplateColumns = "repeat(8, 1fr)";

  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = FILES[file] + rank;
      const isLight = (file + (rank - 1)) % 2 === 1;
      const square = document.createElement("div");
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.dataset.file = FILES[file];
      square.dataset.rank = String(rank);

      const inner = document.createElement("div");
      inner.className = "square-inner";

      const coordFile = document.createElement("span");
      coordFile.className = "coord coord-file";
      coordFile.textContent = FILES[file];

      const coordRank = document.createElement("span");
      coordRank.className = "coord coord-rank";
      coordRank.textContent = String(rank);

      const piece = document.createElement("img");
      piece.className = "piece";
      piece.alt = "";
      piece.draggable = false;

      const ovSelected = document.createElement("div");
      ovSelected.className = "overlay ov-selected";
      const ovLast = document.createElement("div");
      ovLast.className = "overlay ov-last";
      const ovCheck = document.createElement("div");
      ovCheck.className = "overlay ov-check";

      const marker = document.createElement("div");
      marker.className = "marker";

      inner.append(coordFile, coordRank, piece, ovSelected, ovLast, ovCheck, marker);
      square.appendChild(inner);
      boardEl.appendChild(square);
      squareEls.set(sq, square);
    }
  }

  boardEl.addEventListener("click", (ev) => {
    const target = (ev.target as HTMLElement).closest(".square") as HTMLElement | null;
    if (!target || !clickHandler) return;
    const file = target.dataset.file;
    const rank = target.dataset.rank;
    if (file && rank) clickHandler(file + rank);
  });

  container.appendChild(boardEl);
}

export function setClickHandler(cb: (square: string) => void): void {
  clickHandler = cb;
}

export function setOrientation(color: PieceColor): void {
  if (!boardEl) return;
  boardEl.classList.toggle("flipped", color === "b");
}

function parseFen(fen: string): string[][] {
  const rows: string[][] = [];
  const placement = fen.split(" ")[0] ?? "";
  for (const row of placement.split("/")) {
    const cells: string[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push("");
      } else {
        cells.push(ch);
      }
    }
    rows.push(cells);
  }
  return rows;
}

export function renderBoard(input: BoardRender): void {
  if (!boardEl) return;

  setOrientation(input.orientation);
  const fileLabelRank = input.orientation === "w" ? 1 : 8;

  const pieceMap = new Map<string, string>();
  const rows = parseFen(input.fen);
  for (let r = 0; r < 8; r++) {
    const rank = 8 - r;
    for (let f = 0; f < 8; f++) {
      const sq = FILES[f] + rank;
      const ch = rows[r]?.[f] ?? "";
      if (ch) pieceMap.set(sq, ch);
    }
  }

  const targetSet = new Set(input.legalTargets);
  const captureSet = new Set(input.captureTargets);

  for (const [sq, square] of squareEls) {
    const inner = square.querySelector(".square-inner") as HTMLElement;
    if (!inner) continue;

    const pieceImg = inner.querySelector(".piece") as HTMLImageElement;
    const piece = pieceMap.get(sq);
    if (piece) {
      pieceImg.src = pieceIcon(piece);
      pieceImg.style.display = "";
    } else {
      pieceImg.removeAttribute("src");
      pieceImg.style.display = "none";
    }

    const coordFile = inner.querySelector(".coord-file") as HTMLElement;
    const coordRank = inner.querySelector(".coord-rank") as HTMLElement;
    const rankNum = Number(sq[1]);
    coordFile.style.visibility = rankNum === fileLabelRank ? "" : "hidden";
    coordRank.style.visibility = sq[0] === "a" ? "" : "hidden";

    inner
      .querySelector(".ov-selected")!
      .classList.toggle("on", input.selected === sq);
    inner
      .querySelector(".ov-last")!
      .classList.toggle("on", input.lastFrom === sq || input.lastTo === sq);
    inner
      .querySelector(".ov-check")!
      .classList.toggle("on", input.checkSquare === sq);

    const marker = inner.querySelector(".marker") as HTMLElement;
    if (targetSet.has(sq)) {
      marker.classList.toggle("dot", !captureSet.has(sq));
      marker.classList.toggle("ring", captureSet.has(sq));
      marker.style.display = "";
    } else {
      marker.classList.remove("dot", "ring");
      marker.style.display = "none";
    }
  }
}

// ---------------------------------------------------------------------------
// 升变弹窗
// ---------------------------------------------------------------------------

const PROMO_LABELS: Record<PromotionPiece, string> = {
  q: "后",
  r: "车",
  b: "象",
  n: "马",
};

let promoOverlay: HTMLElement | null = null;

export function showPromotionDialog(
  color: PieceColor,
  onPick: (piece: PromotionPiece) => void
): void {
  hidePromotionDialog();

  promoOverlay = document.createElement("div");
  promoOverlay.className = "promo-overlay";

  const box = document.createElement("div");
  box.className = "promo-box";

  const title = document.createElement("div");
  title.className = "promo-title";
  title.textContent = "升变为：";

  const row = document.createElement("div");
  row.className = "promo-row";

  (["q", "r", "b", "n"] as PromotionPiece[]).forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "promo-btn";
    btn.type = "button";

    const icon = document.createElement("img");
    icon.className = "promo-icon";
    icon.src = pieceIcon(color === "w" ? p.toUpperCase() : p.toLowerCase());
    icon.alt = PROMO_LABELS[p];

    const label = document.createElement("span");
    label.className = "promo-label";
    label.textContent = PROMO_LABELS[p];

    btn.append(icon, label);
    btn.addEventListener("click", () => {
      hidePromotionDialog();
      onPick(p);
    });
    row.appendChild(btn);
  });

  box.append(title, row);
  promoOverlay.appendChild(box);
  document.body.appendChild(promoOverlay);
}

export function hidePromotionDialog(): void {
  if (promoOverlay) {
    promoOverlay.remove();
    promoOverlay = null;
  }
}

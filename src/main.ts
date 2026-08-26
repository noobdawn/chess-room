import "./style.css";
import { Chess } from "chess.js";
import { isConfigured } from "./firebase.config";
import {
  joinRoom,
  listenRoom,
  listenConnection,
  makeMove,
  resetGame,
  type RoomState,
  type Seat,
} from "./db";
import {
  mountBoard,
  setClickHandler,
  renderBoard,
  showPromotionDialog,
} from "./board";
import { mountStatus, setResetHandler, renderStatus } from "./ui";

// ---------------------------------------------------------------------------
// 应用状态
// ---------------------------------------------------------------------------

let room: RoomState | null = null;
let connected = false;
let mySeat: Seat | null = null;
let opponentEverPresent = false;

let selected: string | null = null;
let legalTargets: string[] = [];
let captureTargets: string[] = [];
let lastFen: string | null = null;

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function chessOf(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(); // 数据异常时回退到初始局面，避免整页崩溃
  }
}

function pieceAt(
  fen: string,
  sq: string
): { color: "w" | "b"; type: string } | null {
  const board = chessOf(fen).board();
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.square === sq) {
        return { color: cell.color, type: cell.type };
      }
    }
  }
  return null;
}

function clearSelection(): void {
  selected = null;
  legalTargets = [];
  captureTargets = [];
}

function opponentOf(seat: Seat | null): Seat | null {
  if (seat === "white") return "black";
  if (seat === "black") return "white";
  return null;
}

// ---------------------------------------------------------------------------
// DOM 构建
// ---------------------------------------------------------------------------

function buildDom(): void {
  const app = document.getElementById("app");
  if (!app) return;

  const title = document.createElement("h1");
  title.className = "app-title";
  title.textContent = "我们的国际象棋";

  const boardWrap = document.createElement("div");
  boardWrap.id = "board-wrap";

  const statusWrap = document.createElement("div");
  statusWrap.id = "status-wrap";

  app.append(title, boardWrap, statusWrap);
  mountBoard(boardWrap);
  mountStatus(statusWrap);
}

function renderSetupGuide(): void {
  const app = document.getElementById("app");
  if (!app) return;

  const page = document.createElement("div");
  page.className = "setup-page";

  const box = document.createElement("div");
  box.className = "setup-box";
  box.innerHTML = `
    <h1>还差一步：配置 Firebase</h1>
    <p>这是双人联机国际象棋，通过 Firebase Realtime Database 做云端中转。目前还没有填入配置，按下面的步骤操作即可：</p>
    <ol>
      <li>打开 <code>console.firebase.google.com</code>，登录后点击「添加项目」新建一个项目（名称随意，比如 chess-room）。</li>
      <li>在左侧菜单「构建」→「Realtime Database」→「创建数据库」。</li>
      <li>地区任选，安全规则选择「测试模式」即可开始（正式上线前记得再收紧规则）。</li>
      <li>进入「项目设置」→「常规」→「您的应用」，点 Web 应用图标（<code>&lt;/&gt;</code>）注册应用，复制配置代码。</li>
      <li>把 <code>apiKey</code>、<code>authDomain</code>、<code>databaseURL</code>、<code>projectId</code>、<code>appId</code> 填进 <code>src/firebase.config.ts</code>。</li>
      <li>重新运行 <code>npm run build</code>，部署到 GitHub Pages 后打开页面即可开始对局。</li>
    </ol>
    <p>对局方式：两位玩家访问同一个网址，先到的是白方，后到的是黑方，其余人是观众。</p>
  `;

  page.appendChild(box);
  app.appendChild(page);
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

function renderAll(): void {
  if (!room) return;
  const fen = room.game.fen;

  // 局面有变化时清掉本地选中状态
  if (lastFen !== null && lastFen !== fen) {
    clearSelection();
  }
  lastFen = fen;

  const chess = chessOf(fen);

  // 被将军的国王所在格
  let checkSquare: string | null = null;
  if (chess.inCheck()) {
    const board = chess.board();
    outer: for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === chess.turn()) {
          checkSquare = cell.square;
          break outer;
        }
      }
    }
  }

  const history = room.game.history ?? [];
  const last = history.length > 0 ? history[history.length - 1] : null;

  renderBoard({
    fen,
    orientation: mySeat === "black" ? "b" : "w",
    selected,
    legalTargets,
    captureTargets,
    lastFrom: last?.from ?? null,
    lastTo: last?.to ?? null,
    checkSquare,
  });

  renderStatus({
    connected,
    opponentEverPresent,
    mySeat,
    players: room.players,
    fen,
    result: room.game.result,
    history,
  });
}

// ---------------------------------------------------------------------------
// 棋盘交互
// ---------------------------------------------------------------------------

function onSquareClick(sq: string): void {
  if (!room || !mySeat) return;

  // 对局已结束：清空选中
  if (room.game.result) {
    clearSelection();
    renderAll();
    return;
  }

  const chess = chessOf(room.game.fen);
  const myColor = mySeat === "white" ? "w" : "b";
  if (chess.turn() !== myColor) return; // 不是己方回合

  // 点击的是当前选中棋子的合法目标格 → 走子
  if (selected && legalTargets.includes(sq)) {
    const from = selected;
    const promoMoves = chess
      .moves({ verbose: true })
      .filter((m) => m.from === from && m.to === sq && m.promotion);
    clearSelection();

    if (promoMoves.length > 0) {
      // 升变：弹出选子弹窗
      showPromotionDialog(myColor, (p) => {
        void makeMove({ from, to: sq, promotion: p });
      });
    } else {
      void makeMove({ from, to: sq });
    }
    renderAll();
    return;
  }

  // 选中 / 切换选中自己的棋子
  const piece = pieceAt(room.game.fen, sq);
  if (piece && piece.color === myColor) {
    selected = sq;
    const moves = chess.moves({ verbose: true }).filter((m) => m.from === sq);
    legalTargets = moves.map((m) => m.to);
    captureTargets = moves
      .filter((m) => m.flags.includes("c") || m.flags.includes("e"))
      .map((m) => m.to);
  } else {
    clearSelection();
  }
  renderAll();
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  listenConnection((c) => {
    connected = c;
    renderAll();
  });

  listenRoom((r) => {
    room = r;
    const opp = opponentOf(mySeat);
    if (opp && r.players[opp]) opponentEverPresent = true;
    renderAll();
  });

  setClickHandler(onSquareClick);
  setResetHandler(() => {
    void resetGame();
  });

  const res = await joinRoom();
  mySeat = res.seat === "spectator" ? null : res.seat;

  // joinRoom 可能先于 room 首次回调完成，这里再补一次对方在场记录
  if (room) {
    const opp = opponentOf(mySeat);
    if (opp && room.players[opp]) opponentEverPresent = true;
  }
  renderAll();
}

if (isConfigured) {
  buildDom();
  void init();
} else {
  renderSetupGuide();
}

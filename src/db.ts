import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  runTransaction,
  type OnDisconnect,
} from "firebase/database";
import { Chess } from "chess.js";
import { firebaseConfig } from "./firebase.config";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type Seat = "white" | "black";
export type MoveColor = "w" | "b";

export interface PlayerSeat {
  id: string;
}

export interface RoomPlayers {
  white: PlayerSeat | null;
  black: PlayerSeat | null;
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fen: string;
  time: number;
}

export interface RoomGame {
  fen: string;
  history: MoveRecord[];
  result: string | null;
}

export interface RoomState {
  players: RoomPlayers;
  game: RoomGame;
}

// ---------------------------------------------------------------------------
// 数据归一化：Firebase RTDB 不保存空数组 / null 值，写入的
// `history: []`、`result: null` 会被数据库删除，读回来时字段缺失。
// 所有从数据库读出的数据都必须先经过这里补齐默认值，否则 UI 会崩。
// ---------------------------------------------------------------------------

function normalizeGame(game: Partial<RoomGame> | null | undefined): RoomGame {
  return {
    fen: typeof game?.fen === "string" && game.fen !== "" ? game.fen : initialFen(),
    history: Array.isArray(game?.history) ? game.history : [],
    result: typeof game?.result === "string" ? game.result : null,
  };
}

function seatOf(value: unknown): PlayerSeat | null {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as PlayerSeat).id === "string"
  ) {
    return { id: (value as PlayerSeat).id };
  }
  return null;
}

function normalizePlayers(players: RoomPlayers | null | undefined): RoomPlayers {
  return { white: seatOf(players?.white), black: seatOf(players?.black) };
}

/** 把可能残缺的数据库原始数据，整理成应用需要的完整 RoomState */
export function normalizeRoom(raw: RoomState | null | undefined): RoomState {
  return {
    players: normalizePlayers(raw?.players),
    game: normalizeGame(raw?.game),
  };
}

export interface LocalMove {
  from: string;
  to: string;
  promotion?: string;
}

// ---------------------------------------------------------------------------
// 房间与身份
// ---------------------------------------------------------------------------

const DEFAULT_ROOM = "love";
const PLAYER_ID_KEY = "chess-room-player-id";

function roomNameFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room && room.trim() !== "" ? room.trim() : DEFAULT_ROOM;
}

export const roomName = roomNameFromUrl();

export function getPlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id || id.length < 8) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export const playerId = getPlayerId();

// Firebase 延迟初始化：未配置（占位符）时不会调用 initializeApp，避免抛错。
let firebaseApp: FirebaseApp | null = null;
let database: ReturnType<typeof getDatabase> | null = null;

function getDb() {
  if (!database) {
    firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
  }
  return database;
}

const roomPath = `/rooms/${roomName}`;
const playersPath = `${roomPath}/players`;
const gamePath = `${roomPath}/game`;

export function initialFen(): string {
  return new Chess().fen();
}

// 当前客户端坐席与最新房间快照（供 UI / 校验使用）
let mySeat: Seat | null = null;
let lastRoom: RoomState | null = null;
let presenceHandle: OnDisconnect | null = null;

export function getMySeat(): Seat | null {
  return mySeat;
}

export function getRoomSnapshot(): RoomState | null {
  return lastRoom;
}

// ---------------------------------------------------------------------------
// 占座 / 加入房间
// ---------------------------------------------------------------------------

export interface JoinResult {
  seat: Seat | "spectator";
}

/**
 * 原子占座：先到者白，后到者黑，其余观战。
 * 若自己的 id 已占用某一座（刷新页面），则直接恢复该座。
 * 占座成功后注册 onDisconnect，关闭浏览器时自动释放座位。
 */
export async function joinRoom(): Promise<JoinResult> {
  const id = playerId;

  const result = await runTransaction(ref(getDb(), roomPath), (room) => {
    const base: RoomState | null =
      room && typeof room === "object" ? normalizeRoom(room as RoomState) : null;
    const baseRoom: RoomState = base ?? {
      players: { white: null, black: null },
      game: { fen: initialFen(), history: [], result: null },
    };

    const players: RoomPlayers = {
      white: baseRoom.players.white,
      black: baseRoom.players.black,
    };

    if (players.white?.id === id || players.black?.id === id) {
      return baseRoom; // 已有座位，保持不变
    }
    if (!players.white) {
      players.white = { id };
    } else if (!players.black) {
      players.black = { id };
    } else {
      return baseRoom; // 满员，观战
    }

    return {
      players,
      game: baseRoom.game,
    };
  });

  let seat: Seat | "spectator" = "spectator";
  if (result.committed && result.snapshot.exists()) {
    const room = normalizeRoom(result.snapshot.val() as RoomState | null);
    lastRoom = room;
    if (room.players?.white?.id === id) seat = "white";
    else if (room.players?.black?.id === id) seat = "black";
  }

  mySeat = seat === "spectator" ? null : seat;

  // 更新 presence：断开连接时把座位写回 null，自动让座。
  // 先取消旧的注册，避免断线时误清掉别人已占用的座位。
  if (presenceHandle) {
    await presenceHandle.cancel().catch(() => undefined);
    presenceHandle = null;
  }
  if (mySeat) {
    presenceHandle = onDisconnect(ref(getDb(), `${playersPath}/${mySeat}`));
    void presenceHandle.set(null).catch(() => undefined);
  }

  return { seat };
}

/**
 * 取消当前客户端所有 presence 注册（一般无需调用）。
 */
export async function leaveRoom(): Promise<void> {
  if (presenceHandle) {
    await presenceHandle.cancel().catch(() => undefined);
    presenceHandle = null;
  }
  mySeat = null;
}

// ---------------------------------------------------------------------------
// 监听房间
// ---------------------------------------------------------------------------

export function listenRoom(cb: (room: RoomState) => void): () => void {
  return onValue(
    ref(getDb(), roomPath),
    (snap) => {
      const room = normalizeRoom(snap.val() as RoomState | null);
      lastRoom = room;
      cb(lastRoom);
    },
    (err) => {
      console.error("房间监听失败:", err);
    }
  );
}

// ---------------------------------------------------------------------------
// 对局结果文案
// ---------------------------------------------------------------------------

function computeResultText(chess: Chess): string | null {
  if (chess.isCheckmate()) {
    return chess.turn() === "b" ? "白方胜" : "黑方胜";
  }
  if (chess.isStalemate()) {
    return "逼和";
  }
  if (chess.isThreefoldRepetition()) {
    return "和棋（三次重复）";
  }
  if (chess.isDrawByFiftyMoves()) {
    return "和棋（五十步规则）";
  }
  if (chess.isInsufficientMaterial() || chess.isDraw()) {
    return "和棋";
  }
  return null;
}

// ---------------------------------------------------------------------------
// 走子
// ---------------------------------------------------------------------------

/**
 * 走一步棋。在数据库事务内基于最新 fen 校验：
 * - 必须是己方回合
 * - 走法必须合法（含升变 promotion）
 * 成功后写入 { fen, history, result }。返回是否成功落子。
 */
export async function makeMove(move: LocalMove): Promise<boolean> {
  if (!mySeat) return false;
  const myColor: MoveColor = mySeat === "white" ? "w" : "b";

  let expectedFen: string | null = null;

  try {
    const result = await runTransaction(ref(getDb(), gamePath), (game) => {
      const g = game as RoomGame | null;
      if (!g || typeof g.fen !== "string") return game;

      let chess: Chess;
      try {
        chess = new Chess(g.fen);
      } catch {
        return game; // 局面数据异常，不写入
      }
      if (chess.turn() !== myColor) return game; // 不是己方回合，放弃写入

      let moved;
      try {
        moved = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      } catch {
        return game; // 非法走法，不写入
      }

      const history = Array.isArray(g.history) ? g.history : [];
      const record: MoveRecord = {
        san: moved.san,
        from: moved.from,
        to: moved.to,
        fen: chess.fen(),
        time: Date.now(),
      };
      // Firebase RTDB 不允许 undefined 值：只有升变时才写入 promotion 字段
      if (typeof moved.promotion === "string") {
        record.promotion = moved.promotion;
      }

      expectedFen = chess.fen();
      return {
        fen: chess.fen(),
        history: [...history, record],
        result: computeResultText(chess),
      };
    });

    if (!result.committed || !result.snapshot.exists() || expectedFen === null) {
      return false;
    }
    const val = result.snapshot.val() as RoomGame;
    return val.fen === expectedFen;
  } catch (err) {
    console.error("走子失败:", err);
    return false;
  }
}

/**
 * 重新开局（仅白方 / host 可调用）。
 */
export function resetGame(): Promise<void> {
  if (mySeat !== "white") return Promise.resolve();
  return set(ref(getDb(), gamePath), {
    fen: initialFen(),
    history: [],
    result: null,
  });
}

// ---------------------------------------------------------------------------
// 连接状态（.info/connected）
// ---------------------------------------------------------------------------

export function listenConnection(cb: (connected: boolean) => void): () => void {
  return onValue(ref(getDb(), ".info/connected"), (snap) => {
    cb(snap.val() === true);
  });
}

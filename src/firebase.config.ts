const firebaseConfig = {
  apiKey: "AIzaSyANguRxDACoS3FPnDByijCwD8MvgKP_P-E",
  authDomain: "family-chess-5122c.firebaseapp.com",
  databaseURL: "https://family-chess-5122c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "family-chess-5122c",
  storageBucket: "family-chess-5122c.firebasestorage.app",
  messagingSenderId: "709827363503",
  appId: "1:709827363503:web:50314692c8c41db87dca5a"
};

export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");

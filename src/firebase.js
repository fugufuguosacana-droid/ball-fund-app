
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ------------------------------------------------------------
// ここをFirebaseコンソールで取得した設定値に置き換えてください。
// Firebaseコンソール → プロジェクトの設定 → 全般 → 「マイアプリ」で
// ウェブアプリを追加すると、この形の設定オブジェクトが表示されます。
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD0nir_TWdcI-9iCSvMTGlw8OY5Emn2ydM",
  authDomain: "ball-fund.firebaseapp.com",
  projectId: "ball-fund",
  storageBucket: "ball-fund.firebasestorage.app",
  messagingSenderId: "227595787087",
  appId: "1:227595787087:web:96ab110d6e5d178206c33a",
};


export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
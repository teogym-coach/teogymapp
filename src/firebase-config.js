// ═══════════════════════════════════════════════════
//  Firebase 설정
//  Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정
//  아래 값을 본인의 Firebase 프로젝트 값으로 교체하세요
// ═══════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyClPq_eisNTPtggKFj0JYkyOzDPLMdf700",
  authDomain:        "teocoach-a7fa0.firebaseapp.com",
  projectId:         "teocoach-a7fa0",
  storageBucket:     "teocoach-a7fa0.firebasestorage.app",
  messagingSenderId: "176130230525",
  appId:             "1:176130230525:web:fa4f4e2fabfe5399475694",
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

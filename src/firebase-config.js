// ═══════════════════════════════════════════════════
//  Firebase 설정
//  Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정
//  아래 값을 본인의 Firebase 프로젝트 값으로 교체하세요
// ═══════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getRuntimeAppMode } from "./app-mode";

export const firebaseConfig = {
  apiKey:            "AIzaSyClPq_eisNTPtggKFj0JYkyOzDPLMdf700",
  authDomain:        "teocoach-a7fa0.firebaseapp.com",
  projectId:         "teocoach-a7fa0",
  storageBucket:     "teocoach-a7fa0.firebasestorage.app",
  messagingSenderId: "176130230525",
  appId:             "1:176130230525:web:fa4f4e2fabfe5399475694",
};

const appName = getRuntimeAppMode();

// 관리자 앱과 회원전용 앱은 같은 Firebase 프로젝트를 쓰지만 Auth app name을 분리한다.
// 이렇게 하면 동일 브라우저/동일 origin에서도 관리자 세션과 회원앱 세션 저장소가 섞이지 않는다.
const app  = initializeApp(firebaseConfig, appName);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const authAppName = appName;

// Firebase Cloud Messaging Service Worker
// PWA 푸시 알림 백그라운드 처리
//
// 주의: 이 파일은 public/ 폴더에 있어야 Firebase Messaging이 자동으로 인식합니다.
// importScripts 경로가 CDN이므로 버전 숫자는 프로젝트의 firebase 패키지 버전과 맞춰야 합니다.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyClPq_eisNTPtggKFj0JYkyOzDPLMdf700",
  authDomain: "teocoach-a7fa0.firebaseapp.com",
  projectId: "teocoach-a7fa0",
  storageBucket: "teocoach-a7fa0.firebasestorage.app",
  messagingSenderId: "176130230525",
  appId: "1:176130230525:web:fa4f4e2fabfe5399475694",
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 (앱이 포커스 없을 때)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "TEO GYM";
  const body = payload.notification?.body || "새 알림이 있습니다.";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png?v=5",
    badge: "/icon-192.png?v=5",
    tag: "teogym-notification",
  });
});

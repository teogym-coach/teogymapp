// FCM 알림 등록 유틸리티
//
// 실제 푸시 발송 (관리자 → 회원) 은 Firebase Cloud Functions (Blaze 플랜) 필요.
// 이 파일은 클라이언트(회원앱)의 알림 권한 요청 + 토큰 등록만 담당한다.
//
// VAPID 키 발급:
//   Firebase Console > 프로젝트 설정 > 클라우드 메시징 > 웹 구성 > 웹 푸시 인증서 생성
//   생성 후 아래 FCM_VAPID_KEY 에 붙여넣기
//
// iOS 제약:
//   iOS 16.4+ + 홈 화면에 추가(PWA)된 경우에만 Web Push 지원
//   일반 Safari 브라우저에서는 지원 안 됨

export const FCM_VAPID_KEY = ""; // TODO: Firebase Console에서 발급 후 입력

/** 현재 알림 권한 상태: "default" | "granted" | "denied" | "unsupported" */
export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** 알림 권한 요청. 이미 결정된 경우 현재 상태 반환. */
export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * FCM 등록 토큰 취득.
 * FCM_VAPID_KEY 가 비어 있거나 권한이 없으면 null 반환.
 * @param {FirebaseApp} firebaseApp - firebase-config.js 에서 export 한 app 인스턴스
 */
export async function getFcmToken(firebaseApp) {
  if (!FCM_VAPID_KEY || !firebaseApp) return null;
  if (getNotificationPermission() !== "granted") return null;
  try {
    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY });
    return token || null;
  } catch (e) {
    console.warn("[FCM] 토큰 발급 실패:", e?.message || e);
    return null;
  }
}

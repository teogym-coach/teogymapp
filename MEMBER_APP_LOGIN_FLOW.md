# 회원앱 로그인 흐름 (Spark 플랜 구조)

관리자 앱은 회원 문서(`members/{memberId}`)에 회원 이메일과 `memberUid`를 저장합니다. 회원앱은 Cloud Functions와 `memberAppIndex` 없이 Firebase Auth로 로그인한 뒤 `members` 컬렉션에서 `memberUid == auth.uid` 조건으로 자기 회원 문서만 조회합니다.

## 관리자 준비

1. 회원 이메일을 `members/{memberId}.email`에 저장합니다.
2. 회원앱 초대를 보내 Firebase Auth 계정을 생성하거나 비밀번호 설정/재설정 메일을 발송합니다.
3. 새 계정을 만든 경우 반환된 Auth UID를 `members/{memberId}.memberUid`에 저장합니다.
4. 이미 존재하던 Auth 계정은 클라이언트에서 UID를 조회할 수 없으므로, 회원이 로그인 오류 화면의 `auth.uid`를 복사해 전달하면 관리자 화면의 수동 연결 입력칸에 저장합니다.

## 회원앱 조회 순서

1. Firebase Auth 로그인으로 `auth.uid`를 확인합니다.
2. `members` 컬렉션에서 `where("memberUid", "==", auth.uid)` + `limit(1)` 쿼리로 회원 문서를 찾습니다.
3. 찾은 `members/{memberId}` 하위의 공개 수업일지, 바디체크, 영양, 체크인, 메시지, 온보딩 정보를 불러옵니다.

## Firestore Rules 원칙

- 대표자는 `trainerUid == request.auth.uid`인 회원 문서와 하위 데이터를 관리합니다.
- 회원 본인은 `memberUid == request.auth.uid`인 자기 회원 문서만 읽습니다.
- 회원 본인의 수업일지는 `isPublished == true`인 문서만 읽을 수 있습니다.
- `memberAppIndex` 컬렉션과 관련 Cloud Function은 사용하지 않습니다.

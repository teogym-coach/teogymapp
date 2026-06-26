# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Dev server at http://localhost:3000
npm run build      # Production build (CI=false)
npm test           # Jest watch mode
npm run regression # Static regression checks — run after every change
```

## Project

관리자 웹앱 + 회원 전용 웹앱 (Create React App PWA, Firebase Auth + Firestore)

## Principles

- 기능 추가보다 안정성 우선
- 수정 전 반드시 원인 분석
- 기존 기능 절대 손상 금지
- Firebase 데이터 손실 금지
- 모바일 UI 우선
- 관련 없는 코드 수정 금지
- Git은 필요한 파일만 수정
- 기존 함수와 로직을 최대한 재사용하고 중복 구현 금지
- 큰 구조 변경이나 데이터 구조 변경은 먼저 설명 후 승인받고 진행
- 수정 후 반드시 `npm run build`와 `npm run regression`을 실행하고 결과를 보고
- 작업 완료 후 수정한 파일과 변경 이유를 간단히 요약

## Work Order

분석 → 원인 → 해결방법 → 수정 → 빌드 → 회귀 테스트 → 수정 내용 요약

설명은 짧고 명확하게.

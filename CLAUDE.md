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
두 앱은 같은 Firebase 데이터(회원, 수업일지, 운동기록, 건강관리)를 공유하는 연동 구조다.

## Principles

- 기능 추가보다 안정성 우선
- 수정 전 반드시 원인 분석
- 기존 기능 절대 손상 금지
- Firebase 데이터 손실 금지
- Firebase 데이터 구조·저장 경로 변경은 반드시 사전 설명 후 승인받고 진행
- 모바일 UI 우선
- 관련 없는 코드 수정 금지
- Git은 필요한 파일만 수정
- 기존 함수와 로직을 최대한 재사용하고 중복 구현 금지
- 한쪽 앱 UI를 수정할 때도 데이터 연동 흐름을 함께 확인한다
- "영향 없게"는 데이터 연동을 끊으라는 뜻이 아니라 의도하지 않은 기능 손상·데이터 손실을 막으라는 의미다
- 수정 후 반드시 `npm run build`와 `npm run regression`을 실행하고 결과를 보고 · 작업 완료 후 수정한 파일과 변경 이유를 간단히 요약

## Work Order

1. 관련 코드와 데이터 흐름 분석
2. 별도 승인 없이 바로 수정 진행
3. `npm run build` 실행 (가능하면 `npm run regression`도 실행)
4. `git commit` 및 `git push`
5. Vercel 배포 확인
6. 최종 결과 요약

**사전 승인이 필요한 경우만 예외**: 큰 구조 변경, 데이터 구조 변경, Firebase 구조 변경 등 프로젝트 전체에 영향을 주는 작업. 일반적인 UI 개선 · 버그 수정 · 기능 개선은 중간 승인 없이 바로 진행한다.

설명은 짧고 명확하게.

#!/usr/bin/env node
/**
 * TEO GYM — Firestore 수동 백업 스크립트
 *
 * 사용법:
 *   node scripts/backup-firestore.js
 *
 * 필요 사전 작업:
 *   1. npm install firebase-admin --save-dev  (처음 한 번만)
 *   2. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
 *      → 다운로드 파일을 scripts/serviceAccount.json 에 저장
 *      (serviceAccount.json 은 .gitignore 에 포함됨 — 절대 커밋하지 말 것)
 *   3. node scripts/backup-firestore.js
 *
 * 백업 대상 컬렉션:
 *   - members (회원 기본 정보)
 *   - members/*/sessions (수업일지)
 *   - members/*/bodyCheck (건강관리)
 *   - members/*/memberOnboarding (온보딩)
 *   - members/*/nutrition (영양 기록)
 *   - members/*/private (관리자 전용 메모)
 *   - notices (공지사항)
 *   - dailyConditioning (데일리 컨디셔닝)
 *
 * 백업 파일 위치: backups/YYYY-MM-DD_HH-MM-SS/
 */

const path = require('path');
const fs   = require('fs');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccount.json');
const BACKUP_ROOT          = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('[오류] scripts/serviceAccount.json 파일이 없습니다.');
  console.error('Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성');
  process.exit(1);
}

let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('[오류] firebase-admin 패키지가 없습니다.');
  console.error('npm install firebase-admin --save-dev 를 먼저 실행하세요.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(BACKUP_ROOT, timestamp);
fs.mkdirSync(backupDir, { recursive: true });

async function getCollection(collectionRef) {
  const snap = await collectionRef.get();
  const docs = {};
  for (const doc of snap.docs) {
    docs[doc.id] = doc.data();
  }
  return docs;
}

async function backupMembers() {
  console.log('회원 목록 백업 중...');
  const membersSnap = await db.collection('members').get();
  const result = {};

  for (const memberDoc of membersSnap.docs) {
    const memberId = memberDoc.id;
    const memberData = memberDoc.data();
    result[memberId] = { ...memberData };

    const subCollections = [
      'sessions', 'bodyCheck', 'memberOnboarding',
      'nutrition', 'private', 'memberCheckins',
      'memberMessages', 'routineRecommendations',
      'dailyConditioning', 'noticeReads', 'assessments',
    ];

    for (const sub of subCollections) {
      try {
        const subData = await getCollection(db.collection('members').doc(memberId).collection(sub));
        if (Object.keys(subData).length > 0) {
          result[memberId][`_sub_${sub}`] = subData;
        }
      } catch (e) {
        console.warn(`  ${memberId}/${sub} 백업 실패:`, e.message);
      }
    }

    console.log(`  ✓ ${memberData.name || memberId} (${memberId})`);
  }

  return result;
}

async function backupTopLevel(collectionName) {
  console.log(`${collectionName} 백업 중...`);
  return getCollection(db.collection(collectionName));
}

async function main() {
  console.log(`\nTEO GYM Firestore 백업 시작: ${timestamp}`);
  console.log(`저장 위치: ${backupDir}\n`);

  try {
    const members          = await backupMembers();
    const notices          = await backupTopLevel('notices');
    const dailyConditioning = await backupTopLevel('dailyConditioning');

    const backup = {
      meta: {
        createdAt: now.toISOString(),
        project:   serviceAccount.project_id,
        version:   '1.0',
      },
      collections: { members, notices, dailyConditioning },
    };

    const outFile = path.join(backupDir, 'backup.json');
    fs.writeFileSync(outFile, JSON.stringify(backup, null, 2), 'utf8');

    const stats = fs.statSync(outFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\n✅ 백업 완료`);
    console.log(`   파일: ${outFile}`);
    console.log(`   크기: ${sizeMB} MB`);
    console.log(`   회원: ${Object.keys(members).length}명`);
    console.log(`   공지: ${Object.keys(notices).length}건`);

  } catch (e) {
    console.error('\n❌ 백업 실패:', e.message);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

main();

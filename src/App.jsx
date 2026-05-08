import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import { auth } from "./firebase-config";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  getMembers, addMember, updateMember, deleteMember,
  getSessions, addSession, updateSession, deleteSession,
  getBodyCheck, saveBodyCheck,
  getNutrition, saveNutrition,
} from "./db";

// ─── 운동 분류 상수 ───
const EQUIP_LIST   = ["바벨","덤벨","케이블","머신","맨몸"];
const EQUIP_COLOR  = {바벨:"#7c6fff",덤벨:"#00e5a0",케이블:"#ffd166",머신:"#ff9f43",맨몸:"#ff6b6b"};
const MUSCLE_MAP   = {
  "가슴":      ["윗가슴","가운데가슴","아랫가슴","전체"],
  "등":        ["등상부","광배근","전체"],
  "어깨":      ["전면","측면","후면","전면+측면","전체"],
  "팔-이두근": ["하부","상부","전체","전완근+상완근"],
  "팔-삼두근": ["장두","단두","내측두","전체"],
  "하체":      ["대퇴사두","햄스트링","둔근","종아리","내전근","전체"],
  "복근":      ["복근"],
  "코어":      ["코어"],
  "기능":      ["기능"],
  "기타":      ["기타"],
};
const MUSCLE_LIST  = Object.keys(MUSCLE_MAP);
const MUSCLE_COLOR = {
  "가슴":"#7c6fff","등":"#00e5a0","어깨":"#ffd166",
  "팔-이두근":"#ff9f43","팔-삼두근":"#ff6b6b",
  "하체":"#54a0ff","복근":"#a29bfe",
  "코어":"#00cec9","기능":"#fd79a8","기타":"#888",
};
function mColor(top) { return MUSCLE_COLOR[top] || "#888"; }
function mSubs(top)  { return MUSCLE_MAP[top] || ["기타"]; }

const CPARTS    = ["경추/목","흉추/등","요추/허리","어깨","고관절","무릎","발목"];
const ROMLEVELS = ["정상","약간 제한","중등도 제한","심한 제한"];
const ROMNUM    = {"정상":0,"약간 제한":1,"중등도 제한":2,"심한 제한":3};
const IC = {저강도:"#00e5a0",중강도:"#ffd166",고강도:"#ff6b6b"};
const CC = {상:{color:"#00e5a0",emoji:"😀"},중:{color:"#ffd166",emoji:"😐"},하:{color:"#ff6b6b",emoji:"😓"}};

function mkSet() { return {weight:"",reps:"",volume:0}; }
function mkEx()  { return {name:"",muscleTop:"가슴",muscleSub:"윗가슴",equipment:"바벨",sets:[mkSet()],feedback:""}; }

// ── 운동 이름 정규화 (띄어쓰기·대소문자 무시) ──────────
function normExName(n) {
  return (n||"").replace(/\s+/g,"").toLowerCase();
}

// 특정 회원+종목명으로 최근 세션 기록 최대 N개 반환
function findPastExRecords(sessions, exName, limit=3) {
  if (!exName || !sessions) return [];
  const norm = normExName(exName);
  const found = [];
  // 날짜 역순으로 정렬 후 탐색
  const sorted = [...sessions].sort((a,b) => (b.date||"").localeCompare(a.date||""));
  for (const s of sorted) {
    if (found.length >= limit) break;
    const match = (s.exercises||[]).find(e => normExName(e.name) === norm);
    if (match) {
      found.push({
        sessionId: s.id,
        date:       s.date || "",
        sessionNo:  s.sessionNo || "",
        exName:     match.name,
        sets:       match.sets || [],
        rpe:        match.rpe  || null,
        feedback:   match.feedback || "",
      });
    }
  }
  return found;
}

// ── 어시스트 머신 판별 ──────────────────────────────
// assistType: "assist" = 체중-보조중량, "bodyweight" = 체중만 (향후 확장)
const ASSIST_MACHINE_KEYWORDS = ["어시스트 풀업", "어시스트 딥스", "어시스트 풀-업", "어시스트 딥 스"];
function getExerciseType(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (ASSIST_MACHINE_KEYWORDS.some(k => n.includes(k.toLowerCase()))) return "assist";
  return null;
}

// 볼륨 계산
// - 일반: weight × reps
// - 어시스트: (memberWeight - assistWeight) × reps
function calcVol(w, r, exType, memberBodyWeight) {
  const weight = parseFloat(w) || 0;
  const reps   = parseInt(r)   || 0;
  if (exType === "assist") {
    const bw      = parseFloat(memberBodyWeight) || 0;
    const realW   = Math.max(0, bw - weight);
    return Math.round(realW * reps);
  }
  return weight * reps;
}

// 실제 운동 중량 반환 (표시용)
function getRealWeight(w, exType, memberBodyWeight) {
  if (exType === "assist") {
    const bw = parseFloat(memberBodyWeight) || 0;
    return Math.max(0, bw - (parseFloat(w) || 0));
  }
  return parseFloat(w) || 0;
}

function exVol(ex, memberBodyWeight) {
  const exType = getExerciseType(ex.name);
  return (ex.sets||[]).reduce((s,r) => {
    if (exType === "assist" && memberBodyWeight) {
      // 저장된 volume 재계산 (memberBodyWeight 있을 때)
      const bw    = parseFloat(memberBodyWeight) || 0;
      const assist= parseFloat(r.weight) || 0;
      const reps  = parseInt(r.reps) || 0;
      return s + Math.max(0, bw - assist) * reps;
    }
    return s + (r.volume || 0);
  }, 0);
}

// ─── CSS ───
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{min-height:100%;min-height:-webkit-fill-available;}
html{height:-webkit-fill-available;}
body{background:#09090c;color:#ddddf0;font-family:'Noto Sans KR',sans-serif;-webkit-text-size-adjust:100%;overscroll-behavior:none;}
input,textarea,select{font-family:'Noto Sans KR',sans-serif;background:#111116;border:1px solid #21212a;color:#ddddf0;border-radius:7px;padding:8px 12px;font-size:16px;width:100%;outline:none;transition:border-color .18s;-webkit-appearance:none;}
input:focus,textarea:focus,select:focus{border-color:#00e5a0;box-shadow:0 0 0 3px rgba(0,229,160,.07);}
input::placeholder,textarea::placeholder{color:#2e2e3e;}
select option{background:#111116;}
textarea{resize:vertical;min-height:54px;}
label{display:block;font-family:'DM Mono',monospace;font-size:10px;color:#54546a;margin-bottom:4px;letter-spacing:.08em;text-transform:uppercase;}
button{cursor:pointer;font-family:'Syne',sans-serif;-webkit-tap-highlight-color:transparent;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#09090c;}::-webkit-scrollbar-thumb{background:#21212a;border-radius:4px;}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fi{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){.g3{grid-template-columns:1fr 1fr!important;}.g2{grid-template-columns:1fr!important;}}
@media print{.noprint{display:none!important;}#pportal{display:block!important;position:fixed;top:0;left:0;width:210mm;}body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
`;

// ════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════
function LoginScreen({ onLogin, loading, error }) {
  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  return (
    <div style={{minHeight:"100vh",background:"#09090c",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:340}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:52,marginBottom:10}}>🏋️</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:"#fff",letterSpacing:"-1px"}}>TEO GYM</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#54546a",marginTop:4}}>트레이너 로그인</div>
        </div>
        <Card>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Field label="이메일" type="email" value={email} onChange={setEmail} placeholder="trainer@example.com" />
            <Field label="비밀번호" type="password" value={pw} onChange={setPw} placeholder="••••••••" />
            {error && <div style={{color:"#ff6b6b",fontFamily:"'DM Mono',monospace",fontSize:11,textAlign:"center"}}>{error}</div>}
            <div style={{marginTop:4}}>
              <Btn full onClick={() => onLogin(email, pw)} disabled={loading || !email || !pw}>
                {loading ? "로그인 중..." : "로그인 →"}
              </Btn>
            </div>
          </div>
        </Card>
        <p style={{textAlign:"center",marginTop:14,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#3a3a4a"}}>
          계정은 Firebase 콘솔 → Authentication에서 생성
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════
export default function App() {
  const [user,     setUser]     = useState(undefined); // undefined = loading
  const [screen,   setScreen]   = useState("home");
  const [members,  setMembers]  = useState([]);
  const [member,   setMember]   = useState(null);
  const [sessions, setSessions] = useState([]);
  const [editSess, setEditSess] = useState(null);
  const [bodyData,  setBodyData]  = useState(null);
  const [nutritionData, setNutritionData] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [toast,    setToast]    = useState(null);
  const [loginErr, setLoginErr] = useState("");

  function showToast(msg, type) {
    setToast({msg, type: type||"ok"});
    setTimeout(() => setToast(null), 2500);
  }

  // Auth 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null));
    return unsub;
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try { setMembers(await getMembers()); }
    catch(e) { showToast("불러오기 실패: "+e.message, "err"); }
    finally { setLoading(false); }
  }, []);


  function goHub(m) {
    setMember(m);
    setSessions([]);
    setScreen("hub");
    getSessions(m.id).then(setSessions).catch(() => {});
  }

  function goHubReload() {
    if (!member) return;
    setScreen("hub");
    getSessions(member.id).then(setSessions).catch(() => {});
  }

  async function handleLogin(email, pw) {
    setLoading(true);
    setLoginErr("");
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch(e) { setLoginErr("로그인 실패: 이메일 또는 비밀번호를 확인해주세요."); }
    finally { setLoading(false); }
  }

  async function handleLogout() {
    await signOut(auth);
    setScreen("home");
    setMember(null);
  }

  async function handleAddMember(d) {
    setLoading(true);
    try { await addMember(d); showToast("회원 등록 완료 ✓"); setMembers(await getMembers()); setScreen("members"); }
    catch(e) { showToast(e.message, "err"); }
    finally { setLoading(false); }
  }

  async function handleUpdateMember(d) {
    setLoading(true);
    try {
      await updateMember(member.id, d);
      const u = {...member,...d};
      setMember(u);
      showToast("수정 완료 ✓");
      setScreen("hub");
      setSessions(await getSessions(u.id));
    } catch(e) { showToast(e.message, "err"); }
    finally { setLoading(false); }
  }

  async function handleDeleteMember(id) {
    if (!window.confirm("이 회원의 모든 기록이 삭제됩니다. 계속할까요?")) return;
    setLoading(true);
    try { await deleteMember(id); showToast("삭제 완료"); setMembers(await getMembers()); }
    catch(e) { showToast(e.message, "err"); }
    finally { setLoading(false); }
  }

  async function handleSaveSession(d) {
    setLoading(true);
    try {
      if (editSess?.id) { await updateSession(member.id, editSess.id, d); showToast("수업 수정 완료 ✓"); }
      else              { await addSession(member.id, d);                  showToast("수업 저장 완료 ✓"); }
      setEditSess(null);
      setSessions(await getSessions(member.id));
      setScreen("hub");
    } catch(e) { showToast(e.message, "err"); }
    finally { setLoading(false); }
  }

  async function handleDeleteSession(s) {
    if (!window.confirm("이 수업 기록을 삭제할까요?")) return;
    setLoading(true);
    try { await deleteSession(member.id, s.id); showToast("삭제 완료"); setSessions(await getSessions(member.id)); }
    catch(e) { showToast(e.message, "err"); }
    finally { setLoading(false); }
  }

  // 로딩 중 (auth 초기화)
  if (user === undefined) return (
    <div style={{minHeight:"100vh",background:"#09090c",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <Spin />
    </div>
  );

  // 로그인 전
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loading} error={loginErr} />;

  return (
    <div style={{minHeight:"100vh",background:"#09090c"}}>
      <style>{CSS}</style>

      {toast && (
        <div style={{position:"fixed",top:"env(safe-area-inset-top, 14px)",left:"50%",
          transform:"translateX(-50%)",zIndex:9999,
          background:toast.type==="err"?"#ff6b6b":"#00e5a0",color:"#09090c",
          fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,
          padding:"9px 20px",borderRadius:8,boxShadow:"0 4px 20px rgba(0,0,0,.5)",
          animation:"fi .2s ease",whiteSpace:"nowrap",maxWidth:"88vw"}}>
          {toast.msg}
        </div>
      )}

      {/* NAV */}
      <nav className="noprint" style={{
        borderBottom:"1px solid #1a1a24",padding:"0 16px",
        paddingTop:"env(safe-area-inset-top, 0px)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        height:"calc(50px + env(safe-area-inset-top, 0px))",
        background:"#09090c",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}}
          onClick={() => { setMember(null); setScreen("home"); }}>
          <div style={{width:26,height:26,borderRadius:7,background:"#00e5a0",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>🏋️</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff"}}>TEO GYM</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {member && (
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#54546a",
              maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {member.name}
            </span>
          )}
          {loading && <Spin sm />}
          <button onClick={handleLogout}
            style={{background:"none",border:"1px solid #1a1a24",borderRadius:6,
              color:"#54546a",fontSize:10,fontWeight:700,padding:"5px 9px"}}>
            로그아웃
          </button>
        </div>
      </nav>

      {/* SCREENS */}
      <div className="noprint" style={{
        maxWidth:820,margin:"0 auto",padding:"18px 14px",
        paddingBottom:"calc(18px + env(safe-area-inset-bottom, 0px))"}}>
        {screen==="home"       && <HomeScreen setScreen={setScreen} loadMembers={loadMembers} />}
        {screen==="members"    && <MembersScreen members={members} loading={loading} onSelect={goHub} onAdd={() => setScreen("newMember")} onRefresh={loadMembers} onDelete={handleDeleteMember} />}
        {screen==="newMember"  && <MemberForm onBack={() => { loadMembers(); setScreen("members"); }} onSave={handleAddMember} />}
        {screen==="editMember" && member && <MemberForm initial={member} onBack={() => setScreen("hub")} onSave={handleUpdateMember} />}
        {screen==="hub"        && member && <HubScreen member={member} sessions={sessions} loading={loading} setScreen={setScreen} onEdit={() => setScreen("editMember")} />}
        {screen==="session"    && member && <SessionScreen member={member} sessions={sessions} editData={editSess} onSave={handleSaveSession} onBack={() => { setEditSess(null); goHubReload(); }} showToast={showToast} bodyData={bodyData} />}
        {screen==="history"    && <HistoryScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} onEdit={s => { setEditSess(s); setScreen("session"); }} onDelete={handleDeleteSession} />}
        {screen==="library"    && <LibraryScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} />}
        {screen==="feedback"   && <FeedbackScreen sessions={sessions} member={member} loading={loading} onBack={() => setScreen("hub")} />}
        {screen==="correction" && <CorrectionScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} />}
        {screen==="nutrition"  && member && <NutritionScreen member={member} onBack={() => setScreen("hub")} nutritionData={nutritionData} onSaveNutrition={async d => { try { await saveNutrition(member.id, d); setNutritionData(d); } catch(e) { showToast(e.message || "저장 실패", "err"); } }} showToast={showToast} targetCal={(() => { const g=bodyData?.goal; if(!g||!g.currentWeight||!g.height||!g.age) return 0; const mult={'거의 안함':1.2,'가벼운 활동 (주 1-2회)':1.375,'보통 활동 (주 3-5회)':1.55,'활동적 (주 6-7회)':1.725,'매우 활동적':1.9}; const bmr=10*parseFloat(g.currentWeight)+6.25*parseFloat(g.height)-5*parseInt(g.age)+(g.gender==='여성'?-161:5); const tdee=Math.round(bmr*(mult[g.activityLevel]||1.375)); const days=g.targetDate?Math.max(1,Math.ceil((new Date(g.targetDate+'T00:00:00')-new Date())/86400000)):null; const loss=parseFloat(g.currentWeight)-parseFloat(g.targetWeight||0); const def=days&&loss>0?Math.round(loss*7700/days):0; return def>0?Math.max(1200,tdee-def):tdee; })()} />}
        {screen==="soreness"   && member && <SorenessScreen member={member} sessions={sessions} onBack={() => setScreen("hub")} onSaveSession={async (sid, d) => { await updateSession(member.id, sid, d); setSessions(await getSessions(member.id)); }} showToast={showToast} />}
        {screen==="analysis"   && member && <RoutineAnalysisScreen member={member} sessions={sessions} onBack={() => setScreen("hub")} />}
        {screen==="assessment" && member && <AssessmentScreen member={member} onBack={() => setScreen("hub")} showToast={showToast} />}
        {screen==="bodycheck"  && member && <BodyCheckScreen member={member} onBack={() => setScreen("hub")} bodyData={bodyData} onSaveBodyData={async d => { try { const saved = await saveBodyCheck(member.id, d); setBodyData(saved || d); } catch(e) { showToast(e.message || "저장 실패", "err"); } }} showToast={showToast} />}
      </div>
      <div id="pportal" style={{display:"none"}} />
    </div>
  );
}

// ════════════════════════════════════════════
// HOME
// ════════════════════════════════════════════
function HomeScreen({ setScreen, loadMembers }) {
  return (
    <div style={{textAlign:"center",paddingTop:52}}>
      <div style={{fontSize:52,marginBottom:12}}>🏋️</div>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:27,color:"#fff",letterSpacing:"-1px",marginBottom:5}}>TEO GYM</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#54546a",marginBottom:44,letterSpacing:".12em"}}>SESSION TRACKER</div>
      <div style={{maxWidth:320,margin:"0 auto"}}>
        <button onClick={() => { loadMembers(); setScreen("members"); }}
          style={{width:"100%",padding:"18px 20px",borderRadius:13,border:"1px solid #1a1a24",
            background:"#111116",color:"#fff",display:"flex",alignItems:"center",gap:14,textAlign:"left"}}>
          <div style={{width:44,height:44,borderRadius:11,background:"rgba(0,229,160,.12)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:21}}>👥</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,marginBottom:3}}>회원 관리</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#54546a"}}>등록 · 수업기록 · 분석</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MEMBERS
// ════════════════════════════════════════════
function MembersScreen({ members, loading, onSelect, onAdd, onRefresh, onDelete }) {
  return (
    <div>
      <SH title="👥 회원 목록" right={
        <div style={{display:"flex",gap:7}}>
          <Btn ghost sm onClick={onRefresh}>↻</Btn>
          <Btn sm onClick={onAdd}>+ 추가</Btn>
        </div>
      } />
      {loading ? <Skel n={4} /> : members.length === 0 ? (
        <Emp msg="등록된 회원이 없습니다. + 추가를 눌러 시작하세요!" />
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {members.map(m => (
            <div key={m.id} style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:10,
              padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:11,cursor:"pointer",flex:1,minWidth:0}}
                onClick={() => onSelect(m)}>
                <div style={{width:36,height:36,borderRadius:9,background:"#1a1a24",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                  "💪"
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#fff",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                  <Mo c="#54546a" s={9}>{m.startDate || ""}{m.ticketInfo ? " · "+m.ticketInfo : ""}</Mo>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDelete(m.id); }}
                style={{background:"none",border:"none",color:"#3a3a4a",fontSize:16,padding:"4px 8px",flexShrink:0}}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// MEMBER FORM
// ════════════════════════════════════════════
function MemberForm({ initial, onSave, onBack }) {
  const isEdit    = !!initial;
  const [name,      setName]      = useState(initial?.name        || "");
  const [phone,     setPhone]     = useState(initial?.phone       || "");
  const [goal,      setGoal]      = useState(initial?.goal        || "");
  const [startDate, setStartDate] = useState(initial?.startDate   || new Date().toISOString().split("T")[0]);
  const [painArea,  setPainArea]  = useState(initial?.painArea    || "");
  const [memo,      setMemo]      = useState(initial?.memo        || "");
  const [sessions,  setSessions2] = useState(initial?.totalSessions || "");
  const [ticketInfo,setTicketInfo]= useState(initial?.ticketInfo  || "");

  return (
    <div>
      <SH title={isEdit ? "✏️ 회원 수정" : "➕ 회원 등록"} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Field label="이름 *"   value={name}  onChange={setName}  placeholder="김회원" />
          <Field label="전화번호" value={phone} onChange={setPhone} placeholder="010-0000-0000" />
        </div>
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:9}}>
          <Field label="시작일" type="date" value={startDate} onChange={setStartDate} />
          <TextArea label="목표" value={goal} onChange={setGoal} placeholder="예: 체지방 감량, 자세 교정, 근력 향상" />
          <TextArea label="불편 부위 / 통증" value={painArea} onChange={setPainArea}
            placeholder="예: 우측 무릎 통증, 허리 불편함, 어깨 가동성 제한 등" />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <Field label="등록 횟수" value={sessions} onChange={setSessions2} placeholder="예: 20회" />
            <Field label="이용권 정보" value={ticketInfo} onChange={setTicketInfo} placeholder="예: 3개월권" />
          </div>
          <TextArea label="메모 / 특이사항" value={memo} onChange={setMemo}
            placeholder="부상 이력, 운동 경력, 기타 특이사항 등" />
        </div>
        <div style={{marginTop:14}}>
          <Btn full
            onClick={() => onSave({name, phone, goal, startDate, painArea, memo, totalSessions:sessions, ticketInfo})}
            disabled={!name}>
            {isEdit ? "수정 저장 →" : "회원 등록 →"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════
// HUB
// ════════════════════════════════════════════
function HubScreen({ member, sessions, loading, setScreen, onEdit }) {
  const isCorr = false;

  const totalVol = sessions.reduce((s,ss) => s+(ss.totalVolume||0), 0);
  const last     = sessions.length > 0 ? sessions[sessions.length-1] : null;
  const wData    = sessions.filter(s => s.bodyWeight && parseFloat(s.bodyWeight) > 0)
                           .map(s => ({name:s.sessionNo+"회", w:parseFloat(s.bodyWeight)}));
  const menus = [
    {icon:"✏️",label:"수업 기록",    desc:"오늘 수업 입력",           sc:"session",    c:"#00e5a0"},
    {icon:"📅",label:"히스토리",     desc:"전체 수업 · 수정 · 삭제",  sc:"history",    c:"#7c6fff"},
    {icon:"📚",label:"운동 라이브러리",desc:"부위별 운동 기록",         sc:"library",    c:"#00bfff"},
    {icon:"📊",label:"블록 피드백",  desc:"부위/기구별 볼륨 분석",    sc:"feedback",   c:"#ffd166"},
    {icon:"⚖️",label:"바디 체크",    desc:"체중·칼로리·인바디 분석",  sc:"bodycheck",  c:"#00cec9"},
    {icon:"💢",label:"근육통 기록",  desc:"부위별 근육통 0~5 기록",    sc:"soreness",   c:"#ff9f43"},
    {icon:"📈",label:"루틴 분석",    desc:"RPE·근육통·볼륨 반응 분석", sc:"analysis",   c:"#7c6fff"},
    {icon:"📋",label:"평가 기록",    desc:"체형·기능·인체도 평가",     sc:"assessment", c:"#a29bfe"},
    {icon:"🥗",label:"영양 관리",    desc:"식단·탄단지·보충제 기록",  sc:"nutrition",  c:"#00b894"},
  ];

  return (
    <div>
      <div style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:12,padding:"14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:44,height:44,borderRadius:11,background:"#1a1a24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
              "💪"
            </div>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#fff"}}>{member.name}</div>
              <Mo c="#54546a" s={9}>{member.startDate || ""}{member.ticketInfo ? " · "+member.ticketInfo : ""}</Mo>
              {member.goal && <Mo c="#7070a0" s={11} style={{display:"block",marginTop:2}}>{member.goal}</Mo>}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn ghost sm onClick={() => setScreen("members")}>← 목록</Btn>
            <Btn ghost sm onClick={onEdit} style={{color:"#7c6fff",borderColor:"#7c6fff33"}}>수정</Btn>
          </div>
        </div>
        {member.painArea && (
          <div style={{marginTop:9,padding:"7px 10px",background:"rgba(255,107,107,.06)",borderRadius:6,fontSize:11,color:"#ff9f43",borderLeft:"2px solid #ff9f4344"}}>
            🩺 {member.painArea}
          </div>
        )}
        {member.memo && <div style={{marginTop:6,padding:"7px 10px",background:"#09090c",borderRadius:6,fontSize:11,color:"#54546a",borderLeft:"2px solid #21212a"}}>{member.memo}</div>}
      </div>

      {!loading && (
        <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:14}}>
          <StatTile label="총 수업" value={sessions.length+"회"} />
          <StatTile label="누적 볼륨" value={(totalVol/1000).toFixed(1)+"t"} />
          <StatTile label="최근 회차" value={last ? last.sessionNo+"회" : "—"} sub={last?.date||""} />
        </div>
      )}

      {wData.length >= 2 && (
        <Card title="⚖️ 체중 변화" style={{marginBottom:14}}>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={wData} margin={{top:6,right:14,left:-18,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24" />
              <XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} />
              <YAxis domain={["auto","auto"]} tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} unit="kg" />
              <Tooltip contentStyle={{background:"#111116",border:"1px solid #1a1a24",borderRadius:8,fontFamily:"'DM Mono',monospace",fontSize:11}} formatter={v => [v+" kg","체중"]} />
              <Line type="monotone" dataKey="w" stroke="#00e5a0" strokeWidth={2} dot={{fill:"#00e5a0",r:3}} name="체중(kg)" />
            </LineChart>
          </ResponsiveContainer>
          {(() => {
            const diff = (wData[wData.length-1].w - wData[0].w).toFixed(1);
            const col  = diff < 0 ? "#00e5a0" : diff > 0 ? "#ff6b6b" : "#54546a";
            const txt  = diff < 0 ? "▼"+Math.abs(diff) : diff > 0 ? "▲"+diff : "변화없음";
            return <div style={{textAlign:"center",marginTop:4,fontFamily:"'DM Mono',monospace",fontSize:10,color:col}}>{txt} kg (시작 대비)</div>;
          })()}
        </Card>
      )}

      {last && (
        <div style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:10,padding:"11px 13px",marginBottom:14}}>
          <Mo c="#54546a" s={9} style={{marginBottom:4}}>최근 수업 — {last.date} · {last.sessionNo}회차</Mo>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{last.type||"웨이트"}</span>
            <Mo c="#00e5a0" s={12}>{(last.totalVolume||0).toLocaleString()} kg</Mo>
          </div>
          {last.trainerComment && <div style={{marginTop:4,fontSize:11,color:"#54546a",fontStyle:"italic"}}>{last.trainerComment}</div>}
        </div>
      )}

      <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {menus.map(m => (
          <button key={m.sc} onClick={() => setScreen(m.sc)}
            style={{background:"#111116",border:"1px solid "+m.c+"28",borderRadius:11,
              padding:"15px 13px",textAlign:"left",cursor:"pointer",color:"#ddddf0",width:"100%"}}>
            <div style={{fontSize:22,marginBottom:8}}>{m.icon}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:m.c,marginBottom:2}}>{m.label}</div>
            <Mo c="#54546a" s={10}>{m.desc}</Mo>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// SESSION SCREEN — 수업 기록 입력
// ════════════════════════════════════════════
function SessionScreen({ member, sessions, editData, onSave, onBack, showToast, bodyData }) {
  const isCorr = false; // 교정 프로그램 구분 제거 - 평가 기록 탭 사용
  const isEdit = !!(editData?.id);
  const last   = sessions.length > 0 ? sessions[sessions.length-1] : null;
  const pRef   = useRef(null);

  const [trainerName,    setTrainerName]    = useState(editData?.trainerName    || last?.trainerName    || "김태오");
  const [gymName,        setGymName]        = useState(editData?.gymName        || last?.gymName        || "테오짐");
  const [date,           setDate]           = useState(editData?.date           || new Date().toISOString().split("T")[0]);
  const [sessionNo,      setSessionNo]      = useState(editData?.sessionNo !== undefined ? editData.sessionNo : (last ? Number(last.sessionNo||0)+1 : 1));
  const [type,           setType]           = useState(editData?.type           || "웨이트");
  const [intensity,      setIntensity]      = useState(editData?.intensity      || "중강도");
  const [condition,      setCondition]      = useState(editData?.condition      || "상");
  const [exercises,      setExercises]      = useState(editData?.exercises      || [mkEx()]);
  const [stretchNotes,   setStretchNotes]   = useState(editData?.stretchingNotes || "");
  const [nextPlan,       setNextPlan]       = useState(editData?.nextPlan       || "");
  const [trainerComment, setTrainerComment] = useState(editData?.trainerComment || "");
  const [refVideo,       setRefVideo]       = useState(editData?.referenceVideo || "");
  const [bodyWeight,     setBodyWeight]     = useState(editData?.bodyWeight     || "");
  const [calories,       setCalories]       = useState(editData?.calories       || "");
  const [dietNote,       setDietNote]       = useState(editData?.dietNote       || "");
  const [romData,        setRomData]        = useState(editData?.romData  || CPARTS.reduce((o,k) => ({...o,[k]:"정상"}), {}));
  const [painData,       setPainData]       = useState(editData?.painData || CPARTS.reduce((o,k) => ({...o,[k]:0}), {}));
  const [showCard,       setShowCard]       = useState(false);

  const totalVol = exercises.reduce((s,e) => s+exVol(e), 0);

  function updateEx(ei, key, val) {
    setExercises(prev => prev.map((ex,i) => {
      if (i !== ei) return ex;
      const u = {...ex, [key]:val};
      if (key === "muscleTop") u.muscleSub = mSubs(val)[0] || "";
      return u;
    }));
  }
  function addEx() { setExercises(prev => [...prev, mkEx()]); }
  function removeEx(ei) { setExercises(prev => prev.filter((_,i) => i!==ei)); }
  function updateSet(ei, si, key, val) {
    setExercises(prev => prev.map((ex,i) => {
      if (i !== ei) return ex;
      const exType = getExerciseType(ex.name);
      const sets   = ex.sets.map((row,j) => {
        if (j !== si) return row;
        const u = {...row, [key]:val};
        if (key==="weight"||key==="reps") {
          const w = key==="weight" ? val : row.weight;
          const r = key==="reps"   ? val : row.reps;
          // memberBodyWeight: 오늘 입력한 체중 → 없으면 최근 세션 체중 사용
          // 체중 우선순위: 오늘 입력 > 바디체크 최신기록 > 이전 세션
          const latestBodyRec = bodyData?.records?.length > 0
            ? [...(bodyData.records)].sort((a,b) => (b.date||"").localeCompare(a.date||""))[0]
            : null;
          const mbw = bodyWeight
            || latestBodyRec?.weight
            || (sessions.length>0 ? sessions[sessions.length-1]?.bodyWeight : "")
            || "";
          u.volume = calcVol(w, r, exType, mbw);
        }
        return u;
      });
      return {...ex, sets};
    }));
  }
  function addSet(ei) { setExercises(prev => prev.map((ex,i) => i===ei ? {...ex,sets:[...ex.sets,mkSet()]} : ex)); }
  function removeSet(ei, si) { setExercises(prev => prev.map((ex,i) => i===ei ? {...ex,sets:ex.sets.filter((_,j)=>j!==si)} : ex)); }

  function handleSave() {
    if (!sessionNo) { showToast("회차를 입력해주세요","err"); return; }
    onSave({
      memberName:member.name, memberId:member.id,
      trainerName, gymName, date, sessionNo:Number(sessionNo),
      programType:member.programType||"일반 PT",
      type, intensity, condition, exercises,
      stretchingNotes:stretchNotes, nextPlan, trainerComment,
      referenceVideo:refVideo, bodyWeight, calories, dietNote,
      romData, painData, totalVolume:totalVol,
    });
  }

  function handlePrint() {
    const p = document.getElementById("pportal");
    if (p && pRef.current) p.innerHTML = pRef.current.innerHTML;
    window.print();
  }

  if (showCard) {
    return (
      <CardSaveView
        member={member} trainerName={trainerName} gymName={gymName}
        date={date} sessionNo={sessionNo} intensity={intensity} condition={condition}
        exercises={exercises} totalVol={totalVol} trainerComment={trainerComment}
        bodyWeight={bodyWeight} onClose={() => setShowCard(false)} showToast={showToast}
      />
    );
  }

  return (
    <div>
      <SH title={isEdit?"🔧 수업 수정":"✏️ 수업 기록"} sub={member.name}
        right={
          <div style={{display:"flex",gap:7}}>
            <Btn ghost sm onClick={() => setShowCard(true)} style={{color:"#00bfff",borderColor:"#00bfff33"}}>📸 카드</Btn>
            <Btn ghost sm onClick={handlePrint}>🖨</Btn>
            <Btn ghost sm onClick={onBack}>← 뒤로</Btn>
          </div>
        } />

      <Card title="기본 정보">
        <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9}}>
          <Field label="트레이너" value={trainerName} onChange={setTrainerName} placeholder="홍길동" />
          <Field label="헬스장"   value={gymName}     onChange={setGymName}     placeholder="피트니스 센터" />
          <Field label="날짜"     value={date}        onChange={setDate}         type="date" />
          <Field label="회차 *"   value={String(sessionNo)} onChange={v => setSessionNo(parseInt(v)||v)} placeholder="1" />
        </div>
        <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginTop:9}}>
          <div>
            <label>수업 유형</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              {["웨이트","유산소","복합운동","스트레칭/이동성","기타"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>강도</label>
            <select value={intensity} onChange={e => setIntensity(e.target.value)}>
              {["저강도","중강도","고강도"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label>컨디션</label>
            <div style={{display:"flex",gap:4}}>
              {["상","중","하"].map(c => {
                const cfg = CC[c]; const active = condition===c;
                return (
                  <button key={c} onClick={() => setCondition(c)}
                    style={{flex:1,padding:"6px 0",borderRadius:6,border:"1px solid",
                      borderColor:active?cfg.color:"#1a1a24",background:active?cfg.color+"22":"transparent",
                      color:active?cfg.color:"#54546a",fontSize:11,fontWeight:800,
                      display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                    <span style={{fontSize:14}}>{cfg.emoji}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:8}}>{c}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card title="운동 목록" style={{marginTop:11}}>
        {exercises.map((ex, ei) => (
          <div key={ei} style={{background:"#09090c",border:"1px solid #1a1a24",borderRadius:10,padding:11,marginBottom:9}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9,flexWrap:"wrap"}}>
              <Mo c="#2a2a3a" s={8} style={{flexShrink:0}}>EX_{String(ei+1).padStart(2,"0")}</Mo>
              <input value={ex.name} onChange={e => updateEx(ei,"name",e.target.value)}
                placeholder="운동 이름" style={{flex:1,minWidth:90,fontWeight:700,fontSize:14}} />
              {exercises.length > 1 && (
                <button onClick={() => removeEx(ei)}
                  style={{background:"none",border:"none",color:"#ff6b6b",fontSize:11,padding:0,whiteSpace:"nowrap"}}>✕ 삭제</button>
              )}
            </div>
            {/* ── 이전 기록 불러오기 ── */}
            {ex.name && (() => {
              const pastRecs = findPastExRecords(sessions, ex.name, 3);
              if (!pastRecs.length) return null;
              const rec = ex._histIdx != null ? pastRecs[ex._histIdx] : pastRecs[0];
              if (!rec) return null;
              return (
                <div style={{marginBottom:9,padding:"8px 10px",background:"rgba(100,100,180,.08)",borderRadius:7,border:"1px solid rgba(100,100,180,.15)"}}>
                  {/* 헤더 */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Mo c="#7c6fff" s={8}>📅 최근 기록</Mo>
                      <Mo c="#54546a" s={8}>{rec.date} · {rec.sessionNo}회차</Mo>
                      {rec.rpe && <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 6px",borderRadius:3,background:"rgba(124,111,255,.2)",color:"#a29bfe"}}>RPE {rec.rpe}</span>}
                    </div>
                    {pastRecs.length > 1 && (
                      <div style={{display:"flex",gap:3}}>
                        {pastRecs.map((_,i) => (
                          <button key={i} onClick={() => updateEx(ei,"_histIdx",i)}
                            style={{width:18,height:18,borderRadius:"50%",border:"1px solid",cursor:"pointer",fontSize:9,fontWeight:800,
                              borderColor:(ex._histIdx||0)===i?"#7c6fff":"#2a2a3a",
                              background:(ex._histIdx||0)===i?"rgba(124,111,255,.25)":"transparent",
                              color:(ex._histIdx||0)===i?"#a29bfe":"#3a3a4a"}}>
                            {i+1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 세트 요약 */}
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                    {rec.sets.map((s,si) => (
                      <span key={si} style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"2px 7px",borderRadius:4,
                        background:"rgba(255,255,255,.05)",color:"#6868a0",border:"1px solid #1a1a24"}}>
                        {si+1}세트 {s.weight||"—"}kg × {s.reps||"—"}회
                      </span>
                    ))}
                  </div>
                  {rec.feedback && <Mo c="#54546a" s={9} style={{display:"block",marginBottom:6}}>💬 {rec.feedback}</Mo>}
                  {/* 불러오기 버튼 */}
                  <button
                    onClick={() => {
                      const newSets = rec.sets.map(s => ({
                        weight: s.weight || "",
                        reps:   s.reps   || "",
                        volume: s.volume || 0,
                      }));
                      updateEx(ei, "sets", newSets);
                      if (rec.rpe) updateEx(ei, "rpe", rec.rpe);
                      if (rec.feedback) updateEx(ei, "feedback", rec.feedback);
                    }}
                    style={{width:"100%",padding:"7px",borderRadius:6,border:"1px solid #7c6fff44",
                      background:"rgba(124,111,255,.15)",color:"#a29bfe",
                      fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    📥 이 기록 불러오기
                  </button>
                </div>
              );
            })()}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
              <div>
                <label>기구</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:2}}>
                  {EQUIP_LIST.map(eq => {
                    const active = ex.equipment===eq; const col = EQUIP_COLOR[eq];
                    return (
                      <button key={eq} onClick={() => updateEx(ei,"equipment",eq)}
                        style={{padding:"4px 9px",borderRadius:4,border:"1px solid",
                          borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",
                          color:active?col:"#54546a",fontSize:10,fontWeight:700}}>{eq}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label>부위</label>
                <select value={ex.muscleTop} onChange={e => updateEx(ei,"muscleTop",e.target.value)} style={{fontSize:12,padding:"6px"}}>
                  {MUSCLE_LIST.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>세부 부위</label>
                <select value={ex.muscleSub} onChange={e => updateEx(ei,"muscleSub",e.target.value)} style={{fontSize:12,padding:"6px"}}>
                  {mSubs(ex.muscleTop).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",borderRadius:4,background:EQUIP_COLOR[ex.equipment]+"22",color:EQUIP_COLOR[ex.equipment]}}>{ex.equipment}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",borderRadius:4,background:mColor(ex.muscleTop)+"22",color:mColor(ex.muscleTop)}}>{ex.muscleTop}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",borderRadius:4,background:"#1a1a24",color:"#7070a0"}}>{ex.muscleSub}</span>
            </div>
            {(() => {
              const exType2 = getExerciseType(ex.name);
              const h1 = exType2==="assist" ? "보조kg" : "무게kg";
              return (
                <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 65px 18px",gap:4,marginBottom:3}}>
                  {["SET",h1,"횟수","볼륨",""].map((h,i) => <Mo key={i} c="#2a2a3a" s={8} style={{textAlign:"center"}}>{h}</Mo>)}
                </div>
              );
            })()}
            {ex.sets.map((row, si) => {
              const exTypeRow = getExerciseType(ex.name);
              const latestRec2 = bodyData?.records?.length > 0
                ? [...(bodyData.records)].sort((a,b) => (b.date||"").localeCompare(a.date||""))[0]
                : null;
              const mbwRow = bodyWeight || latestRec2?.weight || (sessions.length>0 ? sessions[sessions.length-1]?.bodyWeight : "") || "";
              const realWRow  = exTypeRow==="assist" ? getRealWeight(row.weight, exTypeRow, mbwRow) : null;
              return (
                <div key={si} style={{marginBottom:3}}>
                  <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 65px 18px",gap:4,alignItems:"center"}}>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#3a3a4e",background:"#111116",borderRadius:4,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>{si+1}</div>
                    <input value={row.weight} onChange={e => updateSet(ei,si,"weight",e.target.value)} placeholder="0" style={{textAlign:"center",height:32,padding:"0 4px",fontSize:14}} />
                    <input value={row.reps}   onChange={e => updateSet(ei,si,"reps",  e.target.value)} placeholder="0" style={{textAlign:"center",height:32,padding:"0 4px",fontSize:14}} />
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#00e5a0",textAlign:"center",height:32,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,229,160,.06)",borderRadius:5}}>
                      {row.volume>0 ? row.volume.toLocaleString() : "—"}
                    </div>
                    {ex.sets.length>1 ? <button onClick={() => removeSet(ei,si)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:11,padding:0,textAlign:"center"}}>✕</button> : <div />}
                  </div>
                  {exTypeRow==="assist" && row.weight && mbwRow && (
                    <div style={{marginTop:2,padding:"3px 8px",background:"rgba(124,111,255,.08)",borderRadius:5,display:"flex",gap:8,alignItems:"center"}}>
                      <Mo c="#7c6fff" s={8}>체중 {mbwRow}kg − 보조 {row.weight}kg = 실제 {realWRow}kg</Mo>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={() => addSet(ei)} style={{width:"100%",marginTop:3,padding:"6px",border:"1px dashed #1a1a24",borderRadius:5,background:"none",color:"#3a3a4e",fontSize:10,fontWeight:700}}>+ 세트 추가</button>
            {(() => {
              const exType3 = getExerciseType(ex.name);
              const latestRec3 = bodyData?.records?.length > 0
                ? [...(bodyData.records)].sort((a,b) => (b.date||"").localeCompare(a.date||""))[0]
                : null;
              const mbw3 = bodyWeight || latestRec3?.weight || (sessions.length>0 ? sessions[sessions.length-1]?.bodyWeight : "") || "";
              const vol3    = exVol(ex, mbw3);
              return (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:7}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <Mo c="#00e5a0" s={9}>볼륨 {vol3.toLocaleString()} kg</Mo>
                    {exType3==="assist" && mbw3 && (
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"2px 6px",borderRadius:4,
                        background:"rgba(124,111,255,.18)",color:"#7c6fff"}}>체중 {mbw3}kg 기준 보정</span>
                    )}
                    {exType3==="assist" && !mbw3 && (
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"2px 6px",borderRadius:4,
                        background:"rgba(255,107,107,.18)",color:"#ff6b6b"}}>⚠ 체중 입력 필요</span>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* RPE 선택 */}
            <div style={{marginTop:8,marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <Mo c="#54546a" s={8}>RPE</Mo>
                {ex.rpe && <Mo c="#ffd166" s={9}>{ex.rpe} — {["","극저강도","매우 쉬움","쉬움","가벼움","보통","약간 힘듦","힘듦","매우 힘듦","한계 근접","한계"][ex.rpe]}</Mo>}
              </div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const active = ex.rpe === n;
                  const col = n<=4?"#00e5a0":n<=6?"#ffd166":n<=8?"#ff9f43":"#ff6b6b";
                  return (
                    <button key={n} onClick={() => updateEx(ei,"rpe", active ? null : n)}
                      style={{width:28,height:28,borderRadius:6,border:"1px solid",
                        borderColor:active?col:"#1a1a24",
                        background:active?col+"33":"transparent",
                        color:active?col:"#3a3a4a",fontSize:11,fontWeight:800,cursor:"pointer"}}>
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{marginTop:5}}>
              <input value={ex.feedback} onChange={e => updateEx(ei,"feedback",e.target.value)} placeholder="자세 피드백 (선택)" style={{fontSize:12,color:"#8080a0"}} />
            </div>
          </div>
        ))}
        <button onClick={addEx} style={{width:"100%",padding:10,border:"1px dashed #1a1a24",borderRadius:8,background:"none",color:"#54546a",fontSize:12,fontWeight:700}}>+ 운동 종목 추가</button>
        <div style={{marginTop:9,padding:"9px 13px",background:"linear-gradient(135deg,#0d2018,#09090c)",border:"1px solid rgba(0,229,160,.2)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Mo c="#54546a" s={9}>TOTAL VOLUME</Mo>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:"#00e5a0"}}>{totalVol.toLocaleString()} <span style={{fontSize:10,fontWeight:400,color:"#54546a"}}>kg</span></span>
        </div>
      </Card>


}

      <Card title="추가 기록" style={{marginTop:11}}>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <TextArea label="스트레칭 / 마무리" value={stretchNotes}   onChange={setStretchNotes}   placeholder="마무리 스트레칭" />
          <TextArea label="다음 수업 계획"    value={nextPlan}        onChange={setNextPlan}        placeholder="다음 수업 집중 포인트" />
          <TextArea label="트레이너 코멘트"   value={trainerComment}  onChange={setTrainerComment}  placeholder="총평 및 응원 메시지" />
          <Field    label="참고 영상 (선택)"  value={refVideo}        onChange={setRefVideo}        placeholder="https://youtube.com/..." />
        </div>
      </Card>

      <Card title="식단 & 체중 (선택)" style={{marginTop:11}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Field label="체중 (kg)"   value={bodyWeight} onChange={setBodyWeight} placeholder="75.5" />
          <Field label="섭취 칼로리" value={calories}   onChange={setCalories}   placeholder="2200" />
        </div>
        <div style={{marginTop:9}}>
          <TextArea label="식단 메모" value={dietNote} onChange={setDietNote} placeholder="아침 / 점심 / 저녁" />
        </div>
      </Card>

      <div style={{marginTop:14,paddingBottom:32}}>
        <Btn full onClick={handleSave}>{isEdit ? "수정 저장 →" : "저장하기 →"}</Btn>
      </div>

      <div ref={pRef} style={{display:"none"}}>
        <PrintReport memberName={member.name} trainerName={trainerName} gymName={gymName}
          date={date} sessionNo={sessionNo} type={type} intensity={intensity}
          condition={condition} exercises={exercises} totalVol={totalVol}
          stretchNotes={stretchNotes} nextPlan={nextPlan} trainerComment={trainerComment}
          bodyWeight={bodyWeight} calories={calories} dietNote={dietNote}
          romData={romData} painData={painData} isCorr={isCorr} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// CARD SAVE VIEW — 이미지 저장 (iOS 대응)
// ════════════════════════════════════════════
function CardSaveView({ member, trainerName, gymName, date, sessionNo, intensity,
  condition, exercises, totalVol, trainerComment, bodyWeight, onClose, showToast }) {

  const [imgDataUrl, setImgDataUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  async function generateImage() {
    const el = document.getElementById("summary-card-capture");
    if (!el) return;
    setGenerating(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(el, {
        backgroundColor: "#0d0d10", scale: 2, useCORS: true, logging: false,
        allowTaint: true,
      });
      const dataUrl = canvas.toDataURL("image/png");
      setImgDataUrl(dataUrl);

      // PC/Android: 자동 다운로드 시도
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (!isIOS) {
        const link = document.createElement("a");
        link.download = member.name + "_" + sessionNo + "회차_" + date + ".png";
        link.href = dataUrl;
        link.click();
        showToast("이미지 저장 완료 ✓");
      } else {
        showToast("아래 이미지를 길게 눌러 저장하세요");
      }
    } catch(e) {
      showToast("생성 실패. 기기 스크린샷을 이용해주세요","err");
      console.error(e);
    }
    setGenerating(false);
  }

  return (
    <div>
      <SH title="📸 수업 요약 카드" sub="이미지 저장 후 회원에게 전송"
        right={<Btn ghost sm onClick={onClose}>← 닫기</Btn>} />

      {/* 원본 카드 (캡처 대상) */}
      {!imgDataUrl && (
        <div id="summary-card-capture">
          <SummaryCard member={member} trainerName={trainerName} gymName={gymName}
            date={date} sessionNo={sessionNo} intensity={intensity} condition={condition}
            exercises={exercises} totalVol={totalVol} trainerComment={trainerComment} bodyWeight={bodyWeight} />
        </div>
      )}

      {/* 생성된 이미지 — iOS에서 길게 눌러 저장 */}
      {imgDataUrl && (
        <div style={{marginBottom:12}}>
          <div style={{marginBottom:8,padding:"8px 12px",background:"rgba(0,229,160,.1)",
            borderRadius:8,border:"1px solid rgba(0,229,160,.25)",textAlign:"center"}}>
            <Mo c="#00e5a0" s={10}>✓ 이미지 생성 완료 — 아래 이미지를 <strong>길게 눌러</strong> 저장하세요</Mo>
          </div>
          <img src={imgDataUrl} alt="수업 요약 카드"
            style={{width:"100%",borderRadius:12,display:"block"}}
          />
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:imgDataUrl?0:12}}>
        <button onClick={generateImage} disabled={generating}
          style={{width:"100%",padding:"14px",borderRadius:10,border:"none",
            background:generating?"#1a1a24":"linear-gradient(135deg,#00e5a0,#00b37e)",
            color:generating?"#54546a":"#09090c",fontFamily:"'Syne',sans-serif",fontWeight:800,
            fontSize:15,cursor:generating?"not-allowed":"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {generating ? "⏳ 이미지 생성 중..." : imgDataUrl ? "🔄 다시 생성" : "📥 이미지 생성"}
        </button>
        {!imgDataUrl && (
          <div style={{padding:"10px 14px",background:"#111116",borderRadius:8,
            border:"1px dashed #1a1a24",fontSize:11,color:"#54546a",textAlign:"center",lineHeight:1.9}}>
            📥 버튼을 누르면 이미지가 생성됩니다<br/>
            <strong style={{color:"#ddddf0"}}>아이폰/아이패드</strong>: 생성된 이미지를 <strong style={{color:"#00e5a0"}}>길게 눌러</strong> 사진 저장<br/>
            <strong style={{color:"#ddddf0"}}>맥/PC</strong>: 자동으로 파일이 다운로드됩니다
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// SUMMARY CARD
// ════════════════════════════════════════════
function SummaryCard({ member, trainerName, gymName, date, sessionNo, intensity, condition, exercises, totalVol, trainerComment, bodyWeight }) {
  const ic  = IC[intensity] || "#ffd166";
  const cc  = CC[condition] || CC["상"];
  const ds  = date ? new Date(date+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"}) : "";
  const exList = (exercises||[]).filter(e => e.name);
  const byMuscle = {};
  exList.forEach(ex => {
    const key = ex.muscleTop;
    if (!byMuscle[key]) byMuscle[key] = 0;
    byMuscle[key] += exVol(ex);
  });
  return (
    <div style={{background:"#0d0d10",borderRadius:16,overflow:"hidden",maxWidth:480,margin:"0 auto",border:"1px solid #1a1a24"}}>
      <div style={{background:"linear-gradient(135deg,#0d2018,#0d0d10)",padding:"16px 18px",borderBottom:"1px solid #1a1a24"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#00e5a0",letterSpacing:".12em",marginBottom:3}}>PERSONAL TRAINING</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:"#fff",letterSpacing:"-0.5px"}}>{member.name}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#54546a",marginTop:2}}>{gymName}{trainerName?" · "+trainerName:""}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#7070a0"}}>{ds}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#fff",marginTop:2}}>{sessionNo}회차</div>
            <div style={{display:"flex",gap:4,marginTop:5,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"2px 7px",borderRadius:10,background:ic+"22",color:ic}}>{intensity}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"2px 7px",borderRadius:10,background:cc.color+"22",color:cc.color}}>{cc.emoji} {condition}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{padding:"14px 18px"}}>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#54546a",letterSpacing:".1em",marginBottom:10}}>TODAY'S WORKOUT</div>
        {exList.map((ex, ei) => {
          const vol=exVol(ex); const ec=EQUIP_COLOR[ex.equipment]||"#888"; const gc=mColor(ex.muscleTop);
          const maxW=Math.max(0,...(ex.sets||[]).map(r=>parseFloat(r.weight)||0));
          return (
            <div key={ei} style={{marginBottom:10,background:"#111116",borderRadius:10,overflow:"hidden",border:"1px solid #1a1a24"}}>
              <div style={{padding:"8px 12px",borderBottom:"1px solid #1a1a24",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff"}}>{ex.name}</div>
                  <div style={{display:"flex",gap:4,marginTop:3}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 6px",borderRadius:3,background:ec+"22",color:ec}}>{ex.equipment}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 6px",borderRadius:3,background:gc+"22",color:gc}}>{ex.muscleTop}</span>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#00e5a0",fontWeight:500}}>{vol.toLocaleString()} kg</div>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#54546a"}}>최고 {maxW}kg</div>
                </div>
              </div>
              <div style={{padding:"6px 12px"}}>
                <div style={{display:"grid",gridTemplateColumns:"30px 1fr 1fr 1fr",gap:4,marginBottom:4}}>
                  {["SET","무게","횟수","볼륨"].map((h,i) => <Mo key={i} c="#3a3a4a" s={8} style={{textAlign:"center"}}>{h}</Mo>)}
                </div>
                {(ex.sets||[]).map((row,si) => (
                  <div key={si} style={{display:"grid",gridTemplateColumns:"30px 1fr 1fr 1fr",gap:4,marginBottom:3}}>
                    <Mo c="#3a3a4a" s={9} style={{textAlign:"center",background:"#0d0d10",borderRadius:3,padding:"2px 0"}}>{si+1}</Mo>
                    <Mo c="#ddddf0" s={10} style={{textAlign:"center"}}>{row.weight||"—"}</Mo>
                    <Mo c="#ddddf0" s={10} style={{textAlign:"center"}}>{row.reps||"—"}</Mo>
                    <Mo c="#00e5a0" s={10} style={{textAlign:"center"}}>{row.volume>0?row.volume.toLocaleString():"—"}</Mo>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{background:"linear-gradient(135deg,#0d2018,#0d0d10)",borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(0,229,160,.2)",marginBottom:10}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#54546a",marginBottom:2}}>TOTAL VOLUME</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:"#00e5a0"}}>{totalVol.toLocaleString()} <span style={{fontSize:12,color:"#54546a",fontWeight:400}}>kg</span></div>
          </div>
          <div style={{textAlign:"right"}}>
            {Object.entries(byMuscle).slice(0,4).map(([k,v]) => (
              <div key={k} style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#7070a0",marginBottom:1}}>
                <span style={{color:mColor(k)}}>{k}</span><span style={{color:"#54546a"}}> {v.toLocaleString()}kg</span>
              </div>
            ))}
          </div>
        </div>
        {bodyWeight && <div style={{background:"#111116",borderRadius:8,padding:"8px 12px",border:"1px solid #1a1a24",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}><Mo c="#54546a" s={10}>체중</Mo><Mo c="#ffd166" s={14}>{bodyWeight} kg</Mo></div>}
        {trainerComment && <div style={{background:"rgba(0,229,160,.05)",borderRadius:8,padding:"10px 12px",border:"1px solid rgba(0,229,160,.2)",marginBottom:10}}><Mo c="#00e5a0" s={8} style={{marginBottom:5,display:"block"}}>TRAINER COMMENT</Mo><div style={{fontSize:12,color:"#ddddf0",lineHeight:1.65}}>{trainerComment}</div></div>}
        <div style={{marginTop:8,borderTop:"1px solid #1a1a24",paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Mo c="#2a2a3a" s={8}>TEO GYM</Mo>
          <Mo c="#00e5a0" s={9}>{trainerName}{gymName?" · "+gymName:""}</Mo>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════
function HistoryScreen({ sessions, loading, onBack, onEdit, onDelete }) {
  return (
    <div>
      <SH title="📅 히스토리" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />
      {loading ? <Skel n={5} /> : sessions.length===0 ? <Emp msg="수업 기록이 없습니다." /> : (
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {[...sessions].reverse().map((s,i) => (
            <div key={s.id||i} style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:10,padding:"11px 13px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <Mo c="#54546a" s={9} style={{marginBottom:2}}>{s.date} · {s.sessionNo}회차</Mo>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14}}>{s.type||"웨이트"}</div>
                  {s.exercises && s.exercises.length > 0 && (
                    <div style={{display:"flex",gap:3,marginTop:5,flexWrap:"wrap"}}>
                      {s.exercises.slice(0,4).map((ex,j) => (
                        <span key={j} style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 6px",borderRadius:3,background:(EQUIP_COLOR[ex.equipment]||"#888")+"22",color:EQUIP_COLOR[ex.equipment]||"#888"}}>{ex.name||"?"}</span>
                      ))}
                      {s.exercises.length > 4 && <Mo c="#3a3a4a" s={8}>+{s.exercises.length-4}</Mo>}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <Mo c="#00e5a0" s={12}>{(s.totalVolume||0).toLocaleString()} kg</Mo>
                  <div style={{display:"flex",gap:3,marginTop:3,justifyContent:"flex-end"}}>
                    {s.intensity && <Bdg color={IC[s.intensity]}>{s.intensity}</Bdg>}
                    {s.condition && <Bdg color={CC[s.condition]?.color}>{CC[s.condition]?.emoji} {s.condition}</Bdg>}
                  </div>
                </div>
              </div>
              {s.trainerComment && <div style={{marginTop:6,fontSize:10,color:"#54546a",borderTop:"1px solid #1a1a24",paddingTop:6,fontStyle:"italic"}}>{s.trainerComment}</div>}
              <div style={{display:"flex",gap:5,marginTop:8,justifyContent:"flex-end"}}>
                <button onClick={() => onEdit(s)} style={{background:"none",border:"1px solid #1a1a24",borderRadius:5,color:"#7c6fff",fontSize:10,fontWeight:700,padding:"5px 12px"}}>수정</button>
                <button onClick={() => onDelete(s)} style={{background:"none",border:"1px solid #1a1a24",borderRadius:5,color:"#ff6b6b",fontSize:10,fontWeight:700,padding:"5px 12px"}}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════
// LIBRARY
// ════════════════════════════════════════════
// 카테고리 정렬 순서 (기록한 운동이 이 순서에 맞게 자동 분류됨)
const CATEGORY_ORDER = {
  "하체": [
    { label:"1-1. 맨몸 스쿼트 계열",    keywords:["에어 스쿼트","맨몸 스쿼트","점프 스쿼트","와이드 스쿼트","월 스쿼트","박스 스쿼트 맨몸"] },
    { label:"1-2. 스쿼트 계열",          keywords:["스쿼트"] },
    { label:"1-3. 기본 복합 운동",       keywords:["컨벤셔널 데드리프트","고블릿 스쿼트"] },
    { label:"1-4. 레그프레스 계열",      keywords:["레그프레스","레그 프레스","leg press"] },
    { label:"1-5. 대퇴사두 고립",        keywords:["레그 익스텐션","레그익스텐션","leg extension"] },
    { label:"1-6. 햄스트링 계열",        keywords:["레그컬","레그 컬","스티프 레그","루마니안","nordic","노르딕","햄스트링"] },
    { label:"1-7. 둔근 계열",            keywords:["힙 쓰러스트","힙쓰러스트","킥백","글루트","힙 어브덕션","브릿지","클램","둔근"] },
    { label:"1-8. 이너싸이 (내전근)",    keywords:["이너","어덕션","수모","내전"] },
    { label:"1-9. 런지 계열",            keywords:["런지","스플릿 스쿼트","불가리안"] },
    { label:"1-10. 종아리 계열",         keywords:["카프","종아리","calf"] },
  ],
  "등": [
    { label:"2-1. 풀다운 계열",          keywords:["랫풀다운","풀다운","풀업","친업","pulldown","pull up","pullup","스트레이트 암","풀오버"] },
    { label:"2-2. 시티드 케이블 로우",   keywords:["시티드 케이블 로우","시티드케이블","seated cable row"] },
    { label:"2-3. 바벨 로우 계열",       keywords:["바벨 로우","바벨로우","펜들레이","t바","t-바"] },
    { label:"2-4. 덤벨 로우 계열",       keywords:["덤벨 로우","덤벨로우","원암 로우","인클라인 덤벨 로우"] },
    { label:"2-5. 힙힌지 계열",          keywords:["루마니안 데드리프트","스모 데드","컨벤셔널 데드","rdl","데드리프트"] },
  ],
  "가슴": [
    { label:"3-1. 맨몸 계열",            keywords:["푸쉬업","푸시업","push up","pushup"] },
    { label:"3-2. 중간 가슴 — 프레스",  keywords:["벤치프레스","벤치 프레스","벤치","체스트 프레스","chest press"] },
    { label:"3-3. 중간 가슴 — 플라이",  keywords:["펙덱","케이블 크로스","크로스오버","플라이","pec dec"] },
    { label:"3-4. 윗가슴 — 프레스",     keywords:["인클라인 벤치","인클라인벤치","스미스 머신 인클라인","인클라인 프레스"] },
    { label:"3-5. 윗가슴 — 플라이",     keywords:["인클라인 플라이","인클라인플라이","어퍼 크로스","upper cross"] },
    { label:"3-6. 아랫가슴 계열",        keywords:["딥스","dips","디클라인","로우 케이블"] },
  ],
  "어깨": [
    { label:"4-1. 프레스 계열",          keywords:["프레스","press","아놀드","밀리터리","오버헤드"] },
    { label:"4-2. 측면 삼각근 — 레이즈", keywords:["사이드 레이즈","사이드레이즈","업라이트 로우","lateral","옆"] },
    { label:"4-3. 전면 삼각근 — 레이즈", keywords:["프론트 레이즈","프론트레이즈","front raise","앞"] },
    { label:"4-4. 후면 삼각근 — 레이즈", keywords:["리어 레이즈","리어레이즈","페이스풀","리버스 펙덱","리버스 플라이","rear","face pull","후면"] },
  ],
  "팔-이두근": [
    { label:"5-1. 바벨 컬 계열",         keywords:["바벨 컬","바벨컬","ez바","ez컬","프리처 컬 (바벨)"] },
    { label:"5-2. 덤벨 컬 계열",         keywords:["덤벨 컬","덤벨컬","얼터네이트","인클라인 덤벨 컬","컨센트레이션","프리처 컬 (덤벨)"] },
    { label:"5-3. 케이블 컬 계열",       keywords:["케이블 컬","케이블컬","하이 케이블"] },
    { label:"5-4. 뉴트럴·전완 계열",     keywords:["해머 컬","해머컬","크로스 바디","리버스 컬","리버스컬","전완"] },
  ],
  "팔-삼두근": [
    { label:"6-1. 외측두 운동",          keywords:["푸시다운","푸쉬다운","pushdown"] },
    { label:"6-2. 내측두 운동",          keywords:["클로즈 그립","다이아몬드","벤치 딥스","내측"] },
    { label:"6-3. 장두 운동",            keywords:["오버헤드","overhead","장두"] },
    { label:"6-4. 복합·전체 삼두",       keywords:["스컬 크러셔","킥백","딥스","트라이셉스","익스텐션"] },
  ],
};

function matchCategory(exName, keywords) {
  const name = exName.toLowerCase();
  return keywords.some(kw => {
    const k = kw.toLowerCase();
    return name.includes(k) || k.includes(name);
  });
}


function LibraryScreen({ sessions, loading, onBack }) {
  const TABS = ["하체","등","가슴","어깨","팔-이두근","팔-삼두근","복근","코어","기능","기타"];
  const [selTop, setSelTop] = useState("하체");

  if (loading) return <div><SH title="📚 운동 라이브러리" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} /><Skel n={4} /></div>;

  // 기록한 운동만 수집 (이름+부위+기구 기준)
  const recordMap = {}; // key = name
  sessions.forEach(s => {
    (s.exercises||[]).forEach(ex => {
      if (!ex.name) return;
      const k = ex.name;
      if (!recordMap[k]) recordMap[k] = {
        name:ex.name, muscleTop:ex.muscleTop||"기타",
        muscleSub:ex.muscleSub||"기타", equipment:ex.equipment||"기타",
        totalVolume:0, totalSets:0, maxWeight:0, count:0, lastDate:"",
      };
      recordMap[k].totalVolume += exVol(ex);
      recordMap[k].totalSets  += (ex.sets||[]).length;
      recordMap[k].count      += 1;
      const mw = Math.max(0,...(ex.sets||[]).map(r=>parseFloat(r.weight)||0));
      if (mw > recordMap[k].maxWeight) recordMap[k].maxWeight = mw;
      if (!recordMap[k].lastDate || s.date > recordMap[k].lastDate) recordMap[k].lastDate = s.date;
    });
  });

  // 현재 탭에서 기록된 운동들
  const recordedForTab = Object.values(recordMap).filter(e => e.muscleTop === selTop);
  const gc = mColor(selTop);
  const categoryDef = CATEGORY_ORDER[selTop];

  // 카테고리 순서에 따라 기록된 운동 분류
  function buildGroups() {
    if (!categoryDef) {
      // 복근/기타: 기록 순서 그대로
      return recordedForTab.length > 0
        ? [{label:selTop, items:recordedForTab}]
        : [];
    }
    const placed = new Set();
    const groups = [];
    categoryDef.forEach(cat => {
      // 키워드 부분 매칭으로 기록된 운동을 해당 카테고리에 배치
      const items = recordedForTab.filter(e =>
        !placed.has(e.name) && matchCategory(e.name, cat.keywords)
      );
      items.forEach(e => placed.add(e.name));
      if (items.length > 0) groups.push({label:cat.label, items});
    });
    // 어떤 카테고리에도 매칭 안 된 운동 → 맨 아래
    const unplaced = recordedForTab.filter(e => !placed.has(e.name));
    if (unplaced.length > 0) groups.push({label:"기타 기록", items:unplaced});
    return groups;
  }

  const groups = buildGroups();

  return (
    <div>
      <SH title="📚 운동 라이브러리" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />

      {/* 부위 탭 */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
        {TABS.map(top => {
          const col    = mColor(top);
          const cnt    = Object.values(recordMap).filter(e=>e.muscleTop===top).length;
          const active = selTop === top;
          return (
            <button key={top} onClick={() => setSelTop(top)}
              style={{padding:"6px 13px",borderRadius:20,border:"1px solid",
                borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",
                color:active?col:"#54546a",fontSize:12,fontWeight:700,
                display:"flex",alignItems:"center",gap:5}}>
              {top}
              {cnt > 0 && (
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"0 5px",
                  borderRadius:8,background:active?col+"44":"#1a1a24",color:active?col:"#3a3a4a"}}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 기록 없음 */}
      {groups.length === 0 && (
        <div style={{textAlign:"center",padding:"40px 20px",background:"#111116",
          borderRadius:12,border:"1px dashed #1a1a24"}}>
          <div style={{fontSize:32,marginBottom:8}}>📭</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#54546a",marginBottom:4}}>
            {selTop} 운동 기록 없음
          </div>
          <Mo c="#2a2a3a" s={10}>수업 기록에서 {selTop} 운동을 추가하면 여기에 정리됩니다.</Mo>
        </div>
      )}

      {/* 카테고리별 기록 표시 */}
      {groups.map(group => (
        <div key={group.label} style={{marginBottom:18}}>
          {/* 카테고리 헤더 */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{height:1,flex:1,background:gc+"33"}} />
            <div style={{padding:"4px 14px",borderRadius:20,background:gc+"18",border:"1px solid "+gc+"44",
              display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:gc}}>{group.label}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:gc}}>{group.items.length}종</span>
            </div>
            <div style={{height:1,flex:1,background:gc+"33"}} />
          </div>

          {/* 운동 카드 */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {group.items.map((ex, i) => {
              const ec = EQUIP_COLOR[ex.equipment] || "#888";
              return (
                <div key={i} style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:9,padding:"10px 13px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff"}}>{ex.name}</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",
                          borderRadius:4,background:ec+"22",color:ec}}>{ex.equipment}</span>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",
                          borderRadius:4,background:"#1a1a24",color:"#5a5a7a"}}>{ex.muscleSub}</span>
                      </div>
                      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                        <div><Mo c="#54546a" s={8}>수행</Mo><Mo c="#ddddf0" s={11}> {ex.count}회</Mo></div>
                        <div><Mo c="#54546a" s={8}>세트</Mo><Mo c="#ddddf0" s={11}> {ex.totalSets}</Mo></div>
                        <div><Mo c="#54546a" s={8}>최고</Mo><Mo c="#ffd166" s={11}> {ex.maxWeight}kg</Mo></div>
                        <div><Mo c="#54546a" s={8}>볼륨</Mo><Mo c="#00e5a0" s={11}> {ex.totalVolume.toLocaleString()}kg</Mo></div>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                      <Mo c="#3a3a4a" s={8}>마지막</Mo>
                      <Mo c="#54546a" s={9} style={{display:"block"}}>{ex.lastDate||"—"}</Mo>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════
// FEEDBACK
// ════════════════════════════════════════════
function FeedbackScreen({ sessions, member, loading, onBack }) {
  const [bs,setBs]=useState(10); const [bi,setBi]=useState(0); const [vm,setVm]=useState("muscle");
  if(loading) return <div><SH title="📊 블록 피드백" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/><Skel n={4}/></div>;
  if(!sessions.length) return <div><SH title="📊 블록 피드백" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/><Emp msg="수업 기록이 없습니다."/></div>;
  const tb=Math.ceil(sessions.length/bs); const sl=sessions.slice(bi*bs,bi*bs+bs);
  const trendData=sl.map(s=>({name:s.sessionNo+"회",total:s.totalVolume||0}));
  const muscleData=sl.map(s=>{const row={name:s.sessionNo+"회"};MUSCLE_LIST.forEach(g=>{row[g]=0;});(s.exercises||[]).forEach(ex=>{if(ex.muscleTop&&row[ex.muscleTop]!==undefined)row[ex.muscleTop]+=(ex.sets||[]).reduce((a,st)=>a+(st.volume||0),0);});return row;});
  const equipData=sl.map(s=>{const row={name:s.sessionNo+"회"};EQUIP_LIST.forEach(e=>{row[e]=0;});(s.exercises||[]).forEach(ex=>{if(ex.equipment&&row[ex.equipment]!==undefined)row[ex.equipment]+=(ex.sets||[]).reduce((a,st)=>a+(st.volume||0),0);});return row;});
  const detailMap={};sl.forEach(s=>{(s.exercises||[]).forEach(ex=>{const k=ex.muscleTop+" / "+ex.muscleSub;detailMap[k]=(detailMap[k]||0)+(ex.sets||[]).reduce((a,st)=>a+(st.volume||0),0);});});
  const detailList=Object.entries(detailMap).sort((a,b)=>b[1]-a[1]);
  const muscleTotals=MUSCLE_LIST.map(g=>({g,total:muscleData.reduce((s,r)=>s+(r[g]||0),0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const equipTotals=EQUIP_LIST.map(e=>({e,total:equipData.reduce((s,r)=>s+(r[e]||0),0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const sv=trendData.reduce((s,r)=>s+r.total,0); const pv=bi>0?sessions.slice((bi-1)*bs,bi*bs).reduce((s,ss)=>s+(ss.totalVolume||0),0):null; const tr=pv!=null&&pv>0?((sv-pv)/pv*100).toFixed(1):null;
  const tt={background:"#111116",border:"1px solid #1a1a24",borderRadius:8,fontFamily:"'DM Mono',monospace",fontSize:11};
  return (
    <div>
      <SH title="📊 블록 피드백" sub={member?.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/>
      <div style={{display:"flex",gap:11,marginBottom:13,flexWrap:"wrap"}}>
        <div><Mo c="#54546a" s={8} style={{marginBottom:3}}>블록 단위</Mo><div style={{display:"flex",gap:3}}>{[5,10,20].map(n=><button key={n} onClick={()=>{setBs(n);setBi(0);}} style={{padding:"5px 12px",borderRadius:5,border:"1px solid",borderColor:bs===n?"#00e5a0":"#1a1a24",background:bs===n?"rgba(0,229,160,.12)":"transparent",color:bs===n?"#00e5a0":"#54546a",fontSize:11,fontWeight:700}}>{n}회</button>)}</div></div>
        {tb>1&&<div><Mo c="#54546a" s={8} style={{marginBottom:3}}>블록 선택</Mo><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Array.from({length:tb},(_,i)=><button key={i} onClick={()=>setBi(i)} style={{padding:"5px 10px",borderRadius:5,border:"1px solid",borderColor:bi===i?"#7c6fff":"#1a1a24",background:bi===i?"rgba(124,111,255,.12)":"transparent",color:bi===i?"#7c6fff":"#54546a",fontSize:10,fontWeight:700}}>{i*bs+1}~{Math.min(i*bs+bs,sessions.length)}회</button>)}</div></div>}
      </div>
      <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:11}}>
        <StatTile label="수업 횟수" value={sl.length+"회"}/><StatTile label="총 볼륨" value={(sv/1000).toFixed(1)+"t"} sub={tr!=null?"전블록 "+(tr>0?"+":"")+tr+"%":"."}/><StatTile label="회당 평균" value={(sv/(sl.length||1)/1000).toFixed(1)+"t"}/>
      </div>
      <Card title="세션별 총 볼륨 추이"><ResponsiveContainer width="100%" height={150}><LineChart data={trendData} margin={{top:6,right:6,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/><XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><YAxis tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><Tooltip contentStyle={tt}/><Line type="monotone" dataKey="total" stroke="#00e5a0" strokeWidth={2} dot={{fill:"#00e5a0",r:3}} name="총볼륨(kg)"/></LineChart></ResponsiveContainer></Card>
      <div style={{display:"flex",gap:5,marginTop:11,marginBottom:11,flexWrap:"wrap"}}>
        {[["muscle","💪 부위별"],["equipment","🏋️ 기구별"],["detail","🔍 세부"]].map(([m,l])=><button key={m} onClick={()=>setVm(m)} style={{padding:"6px 14px",borderRadius:7,border:"1px solid",borderColor:vm===m?"#00e5a0":"#1a1a24",background:vm===m?"rgba(0,229,160,.12)":"transparent",color:vm===m?"#00e5a0":"#54546a",fontSize:12,fontWeight:700}}>{l}</button>)}
      </div>
      {vm==="muscle"&&<div><Card title="💪 부위별 볼륨 분포"><ResponsiveContainer width="100%" height={175}><BarChart data={muscleData} margin={{top:6,right:6,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/><XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><YAxis tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}}/>{MUSCLE_LIST.map(g=><Bar key={g} dataKey={g} stackId="a" fill={mColor(g)}/>)}</BarChart></ResponsiveContainer></Card><Card title="💪 누적 부위별 볼륨" style={{marginTop:11}}><div style={{display:"flex",flexDirection:"column",gap:7}}>{muscleTotals.map(({g,total})=><div key={g}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><Mo c={mColor(g)} s={10}>{g}</Mo><Mo c="#6060a0" s={10}>{total.toLocaleString()} kg</Mo></div><div style={{height:5,background:"#1a1a24",borderRadius:3}}><div style={{height:"100%",width:((total/(muscleTotals[0]?.total||1))*100)+"%",background:mColor(g),borderRadius:3,transition:"width .5s"}}/></div></div>)}</div><div style={{marginTop:12,padding:"10px 12px",background:"#09090c",borderRadius:7,border:"1px solid #1a1a24"}}><Mo c="#00e5a0" s={9} style={{marginBottom:5}}>자동 분석</Mo><div style={{fontSize:11,color:"#7070a0",lineHeight:1.7}}>{muscleTotals[0]&&"가장 많이 훈련한 부위는 "+muscleTotals[0].g+"("+muscleTotals[0].total.toLocaleString()+"kg)입니다. "}{muscleTotals.length>1&&muscleTotals[muscleTotals.length-1].g+"("+muscleTotals[muscleTotals.length-1].total.toLocaleString()+"kg) 부위의 비중을 늘려보세요."}{tr!=null&&" 전 블록 대비 볼륨이 "+(parseFloat(tr)>0?"증가":"감소")+"("+tr+"%)했습니다."}</div></div></Card></div>}
      {vm==="equipment"&&<div><Card title="🏋️ 기구별 볼륨 분포"><ResponsiveContainer width="100%" height={175}><BarChart data={equipData} margin={{top:6,right:6,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/><XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><YAxis tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}}/>{EQUIP_LIST.map(e=><Bar key={e} dataKey={e} stackId="a" fill={EQUIP_COLOR[e]}/>)}</BarChart></ResponsiveContainer></Card><Card title="🏋️ 기구별 누적 볼륨" style={{marginTop:11}}><div style={{display:"flex",flexDirection:"column",gap:7}}>{equipTotals.map(({e,total})=><div key={e}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><Mo c={EQUIP_COLOR[e]} s={10}>{e}</Mo><Mo c="#6060a0" s={10}>{total.toLocaleString()} kg</Mo></div><div style={{height:5,background:"#1a1a24",borderRadius:3}}><div style={{height:"100%",width:((total/(equipTotals[0]?.total||1))*100)+"%",background:EQUIP_COLOR[e],borderRadius:3,transition:"width .5s"}}/></div></div>)}</div></Card></div>}
      {vm==="detail"&&<Card title="🔍 세부 부위별 누적 볼륨">{detailList.length===0?<Emp msg="운동 기록이 없습니다."/>:<div style={{display:"flex",flexDirection:"column",gap:7}}>{detailList.map(([key,total])=>{const col=mColor(key.split(" / ")[0]);return<div key={key}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><Mo c={col} s={10}>{key}</Mo><Mo c="#6060a0" s={10}>{total.toLocaleString()} kg</Mo></div><div style={{height:5,background:"#1a1a24",borderRadius:3}}><div style={{height:"100%",width:((total/(detailList[0]?.[1]||1))*100)+"%",background:col,borderRadius:3,transition:"width .5s"}}/></div></div>;})}</div>}</Card>}
    </div>
  );
}

// ════════════════════════════════════════════
// CORRECTION
// ════════════════════════════════════════════
function CorrectionScreen({ sessions, loading, onBack }) {
  if(loading) return <div><SH title="🧘 교정 분석" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/><Skel n={4}/></div>;
  const list=sessions.filter(s=>s.programType==="교정 프로그램"&&s.romData);
  if(!list.length) return <div><SH title="🧘 교정 분석" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/><Emp msg="교정 기록이 없습니다."/></div>;
  const f=list[0],l=list[list.length-1];
  const pc=list.map((s,i)=>{const r={name:(s.sessionNo||i+1)+"회"};CPARTS.forEach(p=>{r[p]=s.painData?.[p]||0;});return r;});
  const rd=CPARTS.map(p=>({part:p.replace("/","·"),처음:f.painData?.[p]||0,현재:l.painData?.[p]||0}));
  const tt={background:"#111116",border:"1px solid #1a1a24",borderRadius:8,fontFamily:"'DM Mono',monospace",fontSize:11};
  const cols=["#7c6fff","#00e5a0","#ffd166","#ff9f43","#ff6b6b","#54a0ff","#a29bfe"];
  return (
    <div>
      <SH title="🧘 교정 분석" right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/>
      <Card title="통증 변화 (처음 vs 현재)"><ResponsiveContainer width="100%" height={200}><RadarChart data={rd} margin={{top:8,right:26,left:26,bottom:8}}><PolarGrid stroke="#1a1a24"/><PolarAngleAxis dataKey="part" tick={{fontFamily:"'DM Mono',monospace",fontSize:9,fill:"#54546a"}}/><Radar name="처음" dataKey="처음" stroke="#ff6b6b" fill="#ff6b6b" fillOpacity={0.15}/><Radar name="현재" dataKey="현재" stroke="#00e5a0" fill="#00e5a0" fillOpacity={0.15}/><Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:9}}/><Tooltip contentStyle={tt}/></RadarChart></ResponsiveContainer><Mo c="#54546a" s={9} style={{textAlign:"center"}}>0=통증 없음 · 10=심함 · 낮을수록 개선</Mo></Card>
      <Card title="부위별 통증 추이" style={{marginTop:11}}><ResponsiveContainer width="100%" height={180}><LineChart data={pc} margin={{top:6,right:6,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/><XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><YAxis domain={[0,10]} tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/><Tooltip contentStyle={tt}/><Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}}/>{CPARTS.map((p,i)=><Line key={p} type="monotone" dataKey={p} stroke={cols[i%cols.length]} strokeWidth={1.5} dot={{r:2}}/>)}</LineChart></ResponsiveContainer></Card>
      <Card title="변화 요약" style={{marginTop:11}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10,minWidth:400}}><thead><tr style={{borderBottom:"1px solid #1a1a24"}}>{["부위","통증처음","통증현재","변화","ROM처음","ROM현재","평가"].map(h=><th key={h} style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#54546a",padding:"5px 6px",textAlign:"center",fontWeight:500}}>{h}</th>)}</tr></thead><tbody>{CPARTS.map(p=>{const p0=f.painData?.[p]||0,p1=l.painData?.[p]||0,diff=p1-p0;const r0=f.romData?.[p]||"정상",r1=l.romData?.[p]||"정상",rD=ROMNUM[r1]-ROMNUM[r0];const imp=diff<0&&rD<=0,wor=diff>0||rD>0;return<tr key={p} style={{borderBottom:"1px solid #1a1a24"}}><td style={{padding:"5px 6px",fontFamily:"'DM Mono',monospace",fontSize:9,color:"#7070a0"}}>{p}</td><td style={{padding:"5px 6px",textAlign:"center"}}>{p0}</td><td style={{padding:"5px 6px",textAlign:"center"}}>{p1}</td><td style={{padding:"5px 6px",textAlign:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,color:diff<0?"#00e5a0":diff>0?"#ff6b6b":"#54546a"}}>{diff<0?"▼"+Math.abs(diff):diff>0?"▲"+diff:"—"}</span></td><td style={{padding:"5px 6px",textAlign:"center",fontSize:9,color:"#6060a0"}}>{r0}</td><td style={{padding:"5px 6px",textAlign:"center",fontSize:9,color:"#6060a0"}}>{r1}</td><td style={{padding:"5px 6px",textAlign:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 5px",borderRadius:4,background:imp?"rgba(0,229,160,.12)":wor?"rgba(255,107,107,.12)":"rgba(84,84,106,.12)",color:imp?"#00e5a0":wor?"#ff6b6b":"#54546a"}}>{imp?"✓ 개선":wor?"⚠ 주의":"유지"}</span></td></tr>;})}   </tbody></table></div></Card>
    </div>
  );
}

// ════════════════════════════════════════════
// PRINT REPORT
// ════════════════════════════════════════════
function PrintReport({ memberName, trainerName, gymName, date, sessionNo, type, intensity, condition, exercises, totalVol, stretchNotes, nextPlan, trainerComment, bodyWeight, calories, dietNote, romData, painData, isCorr }) {
  const ic=IC[intensity]||"#ffd166"; const cc=CC[condition]||CC["상"];
  const ds=date?new Date(date+"T00:00:00").toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"}):"";
  const exList=(exercises||[]).filter(e=>e.name);
  return (
    <div style={{width:"210mm",minHeight:"297mm",background:"#fff",fontFamily:"'Noto Sans KR',sans-serif",color:"#111",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');`}</style>
      <div style={{background:"#09090c",padding:"14px 22px",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}><div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#00e5a0",letterSpacing:".15em",marginBottom:2}}>PERSONAL TRAINING SESSION LOG</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#fff"}}>{gymName||"PT 수업일지"}</div></div><div style={{textAlign:"right"}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#444",marginBottom:1}}>TRAINER</div><div style={{fontFamily:"'Syne',sans-serif",fontSize:11,fontWeight:700,color:"#ccc"}}>{trainerName||"—"}</div></div></div>
      <div style={{padding:"10px 22px",borderBottom:"1px solid #eee",background:"#fafafa",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:8,background:"#09090c",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏋️</div><div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",letterSpacing:".1em"}}>MEMBER</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#09090c"}}>{memberName}</div></div></div><div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#666",marginBottom:3}}>{ds}</div><div style={{display:"flex",gap:3,justifyContent:"flex-end",flexWrap:"wrap"}}>{sessionNo&&<PTag bg="#09090c" color="#fff">{sessionNo}회차</PTag>}<PTag bg="#f0f0f0" color="#444">{type}</PTag><PTag bg={ic} color="#09090c">{intensity}</PTag><PTag bg={cc.color+"22"} color={cc.color} border={"1px solid "+cc.color+"55"}>컨디션 {condition} {cc.emoji}</PTag></div></div></div>
      <div style={{padding:"13px 22px",flex:1}}>
        <PLbl>오늘의 운동</PLbl>
        {exList.map((ex,ei)=>{const vol=exVol(ex);const ec=EQUIP_COLOR[ex.equipment]||"#888";const gc=mColor(ex.muscleTop);return(<div key={ei} style={{marginBottom:8}}><div style={{background:"#09090c",borderRadius:"4px 4px 0 0",padding:"4px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#00e5a0"}}>EX_{String(ei+1).padStart(2,"00")}</span><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:"#fff"}}>{ex.name}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"1px 4px",borderRadius:3,background:ec+"33",color:ec}}>{ex.equipment}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"1px 4px",borderRadius:3,background:gc+"33",color:gc}}>{ex.muscleTop} · {ex.muscleSub}</span></div><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#555"}}>{(ex.sets||[]).length}세트</span></div><table style={{width:"100%",borderCollapse:"collapse",fontSize:9,border:"1px solid #eee",borderTop:"none"}}><thead><tr style={{background:"#f7f7f7"}}>{["SET","무게(kg)","횟수","볼륨(kg)"].map(h=><th key={h} style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",padding:"3px 7px",textAlign:"center",fontWeight:500,borderBottom:"1px solid #eee"}}>{h}</th>)}</tr></thead><tbody>{(ex.sets||[]).map((r,si)=><tr key={si} style={{borderBottom:"1px solid #f4f4f4",background:si%2===0?"#fff":"#fafafa"}}><td style={{padding:"4px 7px",textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#bbb",fontSize:8}}>{si+1}</td><td style={{padding:"4px 7px",textAlign:"center"}}>{r.weight||"—"}</td><td style={{padding:"4px 7px",textAlign:"center"}}>{r.reps||"—"}</td><td style={{padding:"4px 7px",textAlign:"center",fontFamily:"'DM Mono',monospace",color:"#00b37e",fontWeight:500,fontSize:8}}>{r.volume>0?r.volume.toLocaleString():"—"}</td></tr>)}</tbody></table><div style={{background:"#f7f7f7",borderRadius:"0 0 4px 4px",padding:"3px 8px",display:"flex",justifyContent:"space-between",border:"1px solid #eee",borderTop:"none"}}><span style={{fontSize:8,color:"#888",fontStyle:"italic"}}>{ex.feedback||""}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#00b37e"}}>소계 {vol.toLocaleString()} kg</span></div></div>);})}
        <div style={{background:"#09090c",borderRadius:5,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#555",letterSpacing:".1em"}}>TOTAL VOLUME</span><div style={{display:"flex",alignItems:"baseline",gap:3}}><span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:"#00e5a0"}}>{totalVol.toLocaleString()}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#555"}}>kg</span></div></div>
        {(stretchNotes||nextPlan)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:9}}>{stretchNotes&&<PNote title="마무리 스트레칭" content={stretchNotes} accent="#7c6fff"/>}{nextPlan&&<PNote title="다음 수업 계획" content={nextPlan} accent="#00e5a0"/>}</div>}
        {trainerComment&&<div style={{border:"1.5px solid #00e5a0",borderRadius:6,padding:"7px 10px",marginBottom:9,background:"rgba(0,229,160,.03)"}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#00b37e",letterSpacing:".1em",marginBottom:3}}>TRAINER COMMENT</div><div style={{fontSize:10,color:"#222",lineHeight:1.7,fontWeight:500}}>{trainerComment}</div></div>}
        {isCorr&&romData&&<div style={{borderTop:"1px dashed #ddd",paddingTop:9,marginBottom:9}}><PLbl>교정 기록</PLbl><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",marginBottom:3}}>가동범위</div>{CPARTS.map(p=><div key={p} style={{display:"flex",justifyContent:"space-between",fontSize:8,marginBottom:2}}><span style={{color:"#666"}}>{p}</span><span style={{fontFamily:"'DM Mono',monospace",color:romData[p]==="정상"?"#00b37e":romData[p]==="약간 제한"?"#c8a000":"#ff6b6b"}}>{romData[p]||"—"}</span></div>)}</div><div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",marginBottom:3}}>통증 강도</div>{CPARTS.map(p=>{const v=painData?.[p]||0;return<div key={p} style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}><span style={{fontSize:8,color:"#666",width:55,flexShrink:0}}>{p}</span><div style={{flex:1,height:3,background:"#f0f0f0",borderRadius:2}}><div style={{width:(v*10)+"%",height:"100%",background:v>6?"#ff6b6b":v>3?"#ffd166":"#00e5a0",borderRadius:2}}/></div><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,width:10,textAlign:"right",color:v>6?"#ff6b6b":"#00b37e"}}>{v}</span></div>;})}></div></div></div>}
        {(bodyWeight||calories||dietNote)&&<div style={{borderTop:"1px dashed #ddd",paddingTop:9}}><PLbl>식단 & 체중</PLbl><div style={{display:"flex",gap:7,marginBottom:dietNote?6:0}}>{bodyWeight&&<div style={{background:"#f5f5f5",border:"1px solid #eee",borderRadius:5,padding:"4px 9px",textAlign:"center",minWidth:68}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",marginBottom:1}}>체중</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11}}>{bodyWeight} kg</div></div>}{calories&&<div style={{background:"#f5f5f5",border:"1px solid #eee",borderRadius:5,padding:"4px 9px",textAlign:"center",minWidth:68}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#aaa",marginBottom:1}}>칼로리</div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11}}>{calories} kcal</div></div>}</div>{dietNote&&<div style={{fontSize:9,color:"#555",lineHeight:1.6,background:"#fafafa",border:"1px solid #eee",borderRadius:5,padding:"4px 8px"}}>{dietNote}</div>}</div>}
      </div>
      <div style={{background:"#09090c",padding:"7px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#333"}}>TEO GYM</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#00e5a0"}}>{trainerName}{gymName?" · "+gymName:""}</span></div>
    </div>
  );
}


// ════════════════════════════════════════════
// 바디 체크 — 헬퍼
// ════════════════════════════════════════════
const ACTIVITY_MULT = {
  "거의 안함":             1.2,
  "가벼운 활동 (주 1-2회)": 1.375,
  "보통 활동 (주 3-5회)":  1.55,
  "활동적 (주 6-7회)":     1.725,
  "매우 활동적":           1.9,
};
function calcBMR(weight, height, age, gender) {
  const w = parseFloat(weight), h = parseFloat(height), a = parseInt(age);
  if (!w || !h || !a) return 0;
  const base = 10 * w + 6.25 * h - 5 * a;
  return gender === "여성" ? base - 161 : base + 5;
}
function calcTDEE(bmr, act) { return Math.round(bmr * (ACTIVITY_MULT[act] || 1.375)); }
function calcDaysLeft(d) {
  if (!d) return null;
  return Math.max(0, Math.ceil((new Date(d + "T00:00:00") - new Date()) / 86400000));
}

// ════════════════════════════════════════════
// BODY CHECK SCREEN
// ════════════════════════════════════════════
function BodyCheckScreen({ member, onBack, bodyData, onSaveBodyData, showToast }) {
  const [tab,    setTab]    = useState("대시보드");
  const [saving, setSaving] = useState(false);

  const goal      = bodyData?.goal    || {};
  const records   = bodyData?.records || [];
  const inbodyList = bodyData?.inbody  || [];

  const [gCW, setGCW] = useState(goal.currentWeight || "");
  const [gTW, setGTW] = useState(goal.targetWeight  || "");
  const [gTD, setGTD] = useState(goal.targetDate    || "");
  const [gGen,setGGen]= useState(goal.gender        || "남성");
  const [gAge,setGAge]= useState(goal.age           || "");
  const [gH,  setGH]  = useState(goal.height        || "");
  const [gAct,setGAct]= useState(goal.activityLevel || "보통 활동 (주 3-5회)");

  const [rDate, setRDate] = useState(new Date().toISOString().split("T")[0]);
  const [rW,    setRW]    = useState("");
  const [rBF,   setRBF]   = useState("");
  const [rMM,   setRMM]   = useState("");
  const [rFast, setRFast] = useState(true);
  const [rH2O,  setRH2O]  = useState("");
  const [rMemo, setRMemo] = useState("");

  const [iDate, setIDate] = useState(new Date().toISOString().split("T")[0]);
  const [iW,    setIW]    = useState("");
  const [iBF,   setIBF]   = useState("");
  const [iMM,   setIMM]   = useState("");
  const [iBMI,  setIBMI]  = useState("");
  const [iMemo, setIMemo] = useState("");

  const cw        = parseFloat(goal.currentWeight) || 0;
  const tw        = parseFloat(goal.targetWeight)  || 0;
  const bmr       = calcBMR(cw, goal.height, goal.age, goal.gender);
  const tdee      = calcTDEE(bmr, goal.activityLevel);
  const daysLeft  = calcDaysLeft(goal.targetDate);
  const totalLoss = cw - tw;
  const dailyDef  = (daysLeft && totalLoss > 0) ? Math.round((totalLoss * 7700) / daysLeft) : 0;
  const targetCal = dailyDef > 0 ? Math.max(1200, tdee - dailyDef) : 0;
  const weeklyLoss= (daysLeft && totalLoss > 0) ? totalLoss / (daysLeft / 7) : 0;
  const weeklyPct = cw > 0 ? (weeklyLoss / cw) * 100 : 0;

  const latestRec    = records.length > 0 ? records.slice().sort((a,b) => b.date.localeCompare(a.date))[0] : null;
  const latestWeight = latestRec ? parseFloat(latestRec.weight) : cw;
  const lostSoFar    = (cw && latestRec) ? +(cw - latestWeight).toFixed(1) : 0;
  const progressPct  = (cw && tw && cw !== tw) ? Math.min(100, Math.max(0, ((cw - latestWeight) / (cw - tw)) * 100)) : 0;

  function getAssessment() {
    if (!weeklyLoss || weeklyLoss <= 0) return null;
    if (weeklyLoss > 1.5) return { text:"⚠️ 매우 공격적인 감량 속도입니다. 근손실 위험이 높습니다.", color:"#ff6b6b" };
    if (weeklyLoss > 1.0) return { text:"⚡ 공격적인 감량 속도입니다. 단백질 섭취량을 높이세요.", color:"#ffd166" };
    if (weeklyLoss >= 0.3)return { text:"✓ 건강한 감량 속도입니다. 현재 페이스를 유지하세요!", color:"#00e5a0" };
    return { text:"↓ 감량 속도가 느립니다. 식단 또는 운동량을 점검해보세요.", color:"#7c6fff" };
  }
  const assessment = getAssessment();

  const wGraph = records.slice().sort((a,b) => a.date.localeCompare(b.date))
    .map(r => ({ date:r.date.slice(5), weight:parseFloat(r.weight), target:tw||null }));

  const simData = [];
  if (cw && tw && daysLeft && totalLoss > 0) {
    const weeks = Math.min(Math.ceil(daysLeft/7), 26);
    const drop  = totalLoss / Math.ceil(daysLeft/7);
    for (let i = 0; i <= weeks; i++) {
      simData.push({ week:i+"주", "예상":+Math.max(tw, cw-drop*i).toFixed(1), "목표":tw });
    }
  }

  const tt = { background:"#111116", border:"1px solid #1a1a24", borderRadius:8, fontFamily:"'DM Mono',monospace", fontSize:11 };

  async function saveGoal() {
    setSaving(true);
    await onSaveBodyData({ ...bodyData, goal:{ currentWeight:gCW, targetWeight:gTW, targetDate:gTD, gender:gGen, age:gAge, height:gH, activityLevel:gAct } });
    showToast("목표 저장 완료 ✓");
    setSaving(false);
    setTab("대시보드");
  }
  async function saveRecord() {
    if (!rW) { showToast("체중을 입력해주세요","err"); return; }
    setSaving(true);
    const rec = { id:"r"+Date.now(), date:rDate, weight:rW, bodyFat:rBF, muscleMass:rMM, fasting:rFast, water:rH2O, memo:rMemo };
    await onSaveBodyData({ ...bodyData, records:[...(bodyData?.records||[]), rec] });
    showToast("기록 저장 완료 ✓");
    setRW(""); setRBF(""); setRMM(""); setRMemo(""); setRH2O("");
    setSaving(false);
    setTab("대시보드");
  }
  async function saveInbody() {
    if (!iW) { showToast("체중을 입력해주세요","err"); return; }
    setSaving(true);
    const rec = { id:"i"+Date.now(), date:iDate, weight:iW, bodyFat:iBF, muscleMass:iMM, bmi:iBMI, memo:iMemo };
    await onSaveBodyData({ ...bodyData, inbody:[...(bodyData?.inbody||[]), rec] });
    showToast("인바디 저장 완료 ✓");
    setIW(""); setIBF(""); setIMM(""); setIBMI(""); setIMemo("");
    setSaving(false);
  }
  async function deleteRecord(id) {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    await onSaveBodyData({ ...bodyData, records:(bodyData?.records||[]).filter(r => r.id!==id) });
    showToast("삭제 완료");
  }

  const TABS = [
    { key:"대시보드", icon:"📊" }, { key:"기록", icon:"✏️" },
    { key:"목표",   icon:"🎯" }, { key:"인바디", icon:"📋" },
  ];

  return (
    <div>
      <SH title="⚖️ 바디 체크" sub={member.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />

      <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:2}}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{padding:"7px 14px",borderRadius:20,border:"1px solid",flexShrink:0,cursor:"pointer",
              borderColor:tab===t.key?"#00e5a0":"#1a1a24",
              background:tab===t.key?"rgba(0,229,160,.12)":"transparent",
              color:tab===t.key?"#00e5a0":"#54546a",fontSize:12,fontWeight:700}}>
            {t.icon} {t.key}
          </button>
        ))}
      </div>

      {tab === "대시보드" && (
        <div>
          {!goal.currentWeight && (
            <div style={{textAlign:"center",padding:"40px 16px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24",marginBottom:12}}>
              <div style={{fontSize:40,marginBottom:10}}>🎯</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#54546a",marginBottom:6}}>목표를 먼저 설정해주세요</div>
              <Mo c="#2a2a3a" s={10}>목표 탭에서 체중 목표를 입력하면 분석이 시작됩니다.</Mo>
              <div style={{marginTop:14}}><Btn sm onClick={() => setTab("목표")}>목표 설정 →</Btn></div>
            </div>
          )}

          {goal.currentWeight && (
            <div>
              <Card style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div>
                    <Mo c="#54546a" s={9}>현재 체중</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:32,color:"#fff",marginTop:2}}>
                      {latestRec ? latestWeight : cw}<span style={{fontSize:14,color:"#54546a",fontWeight:400}}> kg</span>
                    </div>
                    {lostSoFar !== 0 && (
                      <Mo c={lostSoFar>0?"#00e5a0":"#ff6b6b"} s={11}>
                        {lostSoFar>0?"▼ ":"▲ "}{Math.abs(lostSoFar)}kg 시작 대비
                      </Mo>
                    )}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <Mo c="#54546a" s={9}>목표 체중</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:"#00e5a0",marginTop:2}}>
                      {tw}<span style={{fontSize:12,color:"#54546a",fontWeight:400}}> kg</span>
                    </div>
                    {daysLeft!==null && <Mo c="#3a3a4a" s={9}>{daysLeft}일 남음</Mo>}
                  </div>
                </div>
                <div style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <Mo c="#54546a" s={9}>목표 달성률</Mo>
                    <Mo c="#00e5a0" s={10}>{progressPct.toFixed(1)}%</Mo>
                  </div>
                  <div style={{height:7,background:"#1a1a24",borderRadius:4}}>
                    <div style={{height:"100%",width:progressPct+"%",background:"linear-gradient(90deg,#00e5a0,#7c6fff)",borderRadius:4,transition:"width .6s"}} />
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
                  <div style={{background:"#09090c",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <Mo c="#54546a" s={8}>목표 감량</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#ffd166",marginTop:2}}>{totalLoss.toFixed(1)}kg</div>
                  </div>
                  <div style={{background:"#09090c",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <Mo c="#54546a" s={8}>주당 목표</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#ff9f43",marginTop:2}}>{weeklyLoss>0?weeklyLoss.toFixed(2):"—"}kg</div>
                  </div>
                  <div style={{background:"#09090c",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                    <Mo c="#54546a" s={8}>기록 횟수</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#7c6fff",marginTop:2}}>{records.length}회</div>
                  </div>
                </div>
              </Card>

              {bmr > 0 && (
                <Card title="🔥 칼로리 분석" style={{marginBottom:11}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div style={{background:"#09090c",borderRadius:8,padding:"10px 12px"}}>
                      <Mo c="#54546a" s={8}>기초대사량 (BMR)</Mo>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:"#fff",marginTop:3}}>{Math.round(bmr).toLocaleString()}</div>
                      <Mo c="#3a3a4a" s={8}>kcal / 일</Mo>
                    </div>
                    <div style={{background:"#09090c",borderRadius:8,padding:"10px 12px"}}>
                      <Mo c="#54546a" s={8}>유지 칼로리 (TDEE)</Mo>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:"#ffd166",marginTop:3}}>{tdee.toLocaleString()}</div>
                      <Mo c="#3a3a4a" s={8}>kcal / 일</Mo>
                    </div>
                  </div>
                  {targetCal > 0 && (
                    <div style={{background:"linear-gradient(135deg,#0d2018,#09090c)",border:"1px solid rgba(0,229,160,.25)",borderRadius:10,padding:"13px 15px"}}>
                      <Mo c="#54546a" s={9}>권장 섭취 칼로리</Mo>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:"#00e5a0",marginTop:3,marginBottom:3}}>
                        {targetCal.toLocaleString()}<span style={{fontSize:13,color:"#54546a",fontWeight:400}}> kcal / 일</span>
                      </div>
                      <Mo c="#54546a" s={9}>일일 {dailyDef.toLocaleString()} kcal 적자 필요</Mo>
                    </div>
                  )}
                </Card>
              )}

              {assessment && (
                <Card title="📈 감량 속도 분석" style={{marginBottom:11}}>
                  <div style={{padding:"12px 14px",borderRadius:10,border:"1px solid "+assessment.color+"44",background:assessment.color+"11",marginBottom:10}}>
                    <div style={{fontSize:13,color:assessment.color,fontWeight:700,marginBottom:5}}>{assessment.text}</div>
                    <Mo c="#54546a" s={10}>주당 {weeklyLoss.toFixed(2)}kg 목표 · 체중의 {weeklyPct.toFixed(2)}%</Mo>
                  </div>
                  <div style={{padding:"10px 12px",background:"#09090c",borderRadius:8,border:"1px solid #1a1a24"}}>
                    <Mo c="#00e5a0" s={9} style={{display:"block",marginBottom:5}}>권장 기준 (Mifflin-St Jeor 기반)</Mo>
                    <div style={{fontSize:11,color:"#54546a",lineHeight:1.9}}>
                      {"• 안전 범위: 주당 체중의 0.5~1% ("+( cw*0.005).toFixed(1)+"~"+(cw*0.01).toFixed(1)+"kg)"}<br/>
                      {"• 최대 권장: 주당 1.0kg 이하"}<br/>
                      {"• 1.0kg 초과 시 근손실 위험 증가"}
                    </div>
                  </div>
                </Card>
              )}

              {wGraph.length >= 2 && (
                <Card title="📉 체중 변화 그래프" style={{marginBottom:11}}>
                  <ResponsiveContainer width="100%" height={185}>
                    <LineChart data={wGraph} margin={{top:6,right:14,left:-18,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24" />
                      <XAxis dataKey="date" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} />
                      <YAxis domain={["auto","auto"]} tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} unit="kg" />
                      <Tooltip contentStyle={tt} formatter={(v,n) => [v+"kg", n]} />
                      <Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}} />
                      <Line type="monotone" dataKey="weight" stroke="#00e5a0" strokeWidth={2.5} dot={{fill:"#00e5a0",r:4}} name="실제 체중" />
                      {tw > 0 && <Line type="monotone" dataKey="target" stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name={"목표 "+tw+"kg"} />}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {wGraph.length < 2 && (
                <div style={{textAlign:"center",padding:"20px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24",marginBottom:11}}>
                  <Mo c="#2a2a3a" s={10}>체중 기록을 2회 이상 추가하면 그래프가 표시됩니다.</Mo>
                  <div style={{marginTop:10}}><Btn sm onClick={() => setTab("기록")}>+ 체중 기록 추가</Btn></div>
                </div>
              )}

              {simData.length > 1 && (
                <Card title="🎯 목표 달성 시뮬레이션" style={{marginBottom:11}}>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={simData} margin={{top:6,right:14,left:-18,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24" />
                      <XAxis dataKey="week" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} />
                      <YAxis domain={[tw-2, cw+1]} tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}} unit="kg" />
                      <Tooltip contentStyle={tt} formatter={(v,n) => [v+"kg", n]} />
                      <Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}} />
                      <Line type="monotone" dataKey="예상" stroke="#7c6fff" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="목표" stroke="#ff6b6b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <Mo c="#54546a" s={9} style={{textAlign:"center",display:"block",marginTop:4}}>
                    {goal.targetDate} 목표 {tw}kg 달성 ({daysLeft}일 남음)
                  </Mo>
                </Card>
              )}

              {records.length > 0 && (
                <Card title="📝 최근 기록" style={{marginBottom:11}}>
                  {records.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0,5).map((r,i) => (
                    <div key={r.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<4?"1px solid #1a1a24":"none"}}>
                      <div>
                        <Mo c="#54546a" s={9}>{r.date}{r.fasting?" · 공복":""}</Mo>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:"#fff",marginTop:1}}>{r.weight} kg</div>
                        {r.memo && <Mo c="#3a3a4a" s={9}>{r.memo}</Mo>}
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {r.bodyFat && <Mo c="#ffd166" s={10}>{r.bodyFat}%</Mo>}
                        {r.water && <Mo c="#54a0ff" s={9}>{r.water}ml</Mo>}
                        <button onClick={() => deleteRecord(r.id)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:14,cursor:"pointer"}}>✕</button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "기록" && (
        <Card title="✏️ 오늘 체중 기록">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <Field label="날짜" type="date" value={rDate} onChange={setRDate} />
              <Field label="체중 (kg) *" value={rW} onChange={setRW} placeholder="75.5" />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <Field label="체지방률 (%)" value={rBF} onChange={setRBF} placeholder="25.0" />
              <Field label="골격근량 (kg)" value={rMM} onChange={setRMM} placeholder="35.0" />
            </div>
            <Field label="물 섭취량 (ml)" value={rH2O} onChange={setRH2O} placeholder="2000" />
            <div>
              <label>측정 방법</label>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                {[true, false].map(f => (
                  <button key={String(f)} onClick={() => setRFast(f)}
                    style={{flex:1,padding:"9px",borderRadius:7,border:"1px solid",cursor:"pointer",
                      borderColor:rFast===f?"#00e5a0":"#1a1a24",
                      background:rFast===f?"rgba(0,229,160,.1)":"transparent",
                      color:rFast===f?"#00e5a0":"#54546a",fontSize:12,fontWeight:700}}>
                    {f ? "🌅 공복 측정" : "☀️ 일반 측정"}
                  </button>
                ))}
              </div>
            </div>
            <TextArea label="메모" value={rMemo} onChange={setRMemo} placeholder="오늘 컨디션, 특이사항 등" />
            <Btn full onClick={saveRecord} disabled={saving}>{saving ? "저장 중..." : "기록 저장 →"}</Btn>
          </div>
        </Card>
      )}

      {tab === "목표" && (
        <Card title="🎯 목표 설정">
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <Field label="시작 체중 (kg)" value={gCW} onChange={setGCW} placeholder="80.0" />
              <Field label="목표 체중 (kg)" value={gTW} onChange={setGTW} placeholder="70.0" />
            </div>
            <Field label="목표 날짜" type="date" value={gTD} onChange={setGTD} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
              <Field label="나이" value={gAge} onChange={setGAge} placeholder="30" />
              <Field label="키 (cm)" value={gH} onChange={setGH} placeholder="175" />
            </div>
            <div>
              <label>성별</label>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                {["남성","여성"].map(g => (
                  <button key={g} onClick={() => setGGen(g)}
                    style={{flex:1,padding:"9px",borderRadius:7,border:"1px solid",cursor:"pointer",
                      borderColor:gGen===g?"#00e5a0":"#1a1a24",
                      background:gGen===g?"rgba(0,229,160,.1)":"transparent",
                      color:gGen===g?"#00e5a0":"#54546a",fontSize:13,fontWeight:700}}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label>활동량</label>
              <select value={gAct} onChange={e => setGAct(e.target.value)} style={{marginTop:4}}>
                {Object.keys(ACTIVITY_MULT).map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            {gCW && gH && gAge && (
              <div style={{background:"#09090c",borderRadius:10,padding:"13px 14px",border:"1px solid #1a1a24"}}>
                <Mo c="#00e5a0" s={9} style={{display:"block",marginBottom:8}}>📊 실시간 분석 미리보기</Mo>
                {(() => {
                  const bw=parseFloat(gCW), tw2=parseFloat(gTW)||0;
                  const b2=calcBMR(bw,parseFloat(gH),parseInt(gAge),gGen);
                  const t2=calcTDEE(b2,gAct);
                  const d2=gTD?Math.max(1,Math.ceil((new Date(gTD+"T00:00:00")-new Date())/86400000)):null;
                  const loss2=bw-tw2;
                  const wl2=d2&&loss2>0?(loss2/(d2/7)).toFixed(2):null;
                  const def3=d2&&loss2>0?Math.round((loss2*7700)/d2):null;
                  const tc2=def3?Math.max(1200,t2-def3):null;
                  return (
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><Mo c="#54546a" s={10}>기초대사량 (BMR)</Mo><Mo c="#fff" s={11}>{Math.round(b2).toLocaleString()} kcal</Mo></div>
                      <div style={{display:"flex",justifyContent:"space-between"}}><Mo c="#54546a" s={10}>유지 칼로리 (TDEE)</Mo><Mo c="#ffd166" s={11}>{t2.toLocaleString()} kcal</Mo></div>
                      {tc2 && <div style={{display:"flex",justifyContent:"space-between"}}><Mo c="#54546a" s={10}>권장 섭취 칼로리</Mo><Mo c="#00e5a0" s={11}>{tc2.toLocaleString()} kcal</Mo></div>}
                      {wl2 && <div style={{display:"flex",justifyContent:"space-between"}}><Mo c="#54546a" s={10}>주당 감량 목표</Mo><Mo c={parseFloat(wl2)>1.0?"#ff6b6b":"#00e5a0"} s={11}>{wl2} kg / 주</Mo></div>}
                    </div>
                  );
                })()}
              </div>
            )}
            <Btn full onClick={saveGoal} disabled={saving}>{saving?"저장 중...":"목표 저장 →"}</Btn>
          </div>
        </Card>
      )}

      {tab === "인바디" && (
        <div>
          <Card title="📋 인바디 기록 추가" style={{marginBottom:11}}>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              <Field label="날짜" type="date" value={iDate} onChange={setIDate} />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                <Field label="체중 (kg)" value={iW} onChange={setIW} placeholder="75.5" />
                <Field label="체지방률 (%)" value={iBF} onChange={setIBF} placeholder="25.0" />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                <Field label="골격근량 (kg)" value={iMM} onChange={setIMM} placeholder="35.0" />
                <Field label="BMI" value={iBMI} onChange={setIBMI} placeholder="24.0" />
              </div>
              <TextArea label="메모" value={iMemo} onChange={setIMemo} placeholder="측정 결과 특이사항" />
              <Btn full onClick={saveInbody} disabled={saving}>{saving?"저장 중...":"인바디 저장 →"}</Btn>
            </div>
          </Card>
          {inbodyList.length > 0 ? (
            <Card title="인바디 기록 목록">
              {inbodyList.slice().sort((a,b) => b.date.localeCompare(a.date)).map((r,i) => (
                <div key={r.id||i} style={{padding:"10px 0",borderBottom:i<inbodyList.length-1?"1px solid #1a1a24":"none"}}>
                  <Mo c="#54546a" s={9}>{r.date}</Mo>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:5}}>
                    {r.weight     && <div style={{background:"#09090c",borderRadius:6,padding:"6px 8px",textAlign:"center"}}><Mo c="#54546a" s={8}>체중</Mo><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:"#fff",marginTop:1}}>{r.weight}kg</div></div>}
                    {r.bodyFat    && <div style={{background:"#09090c",borderRadius:6,padding:"6px 8px",textAlign:"center"}}><Mo c="#54546a" s={8}>체지방</Mo><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:"#ffd166",marginTop:1}}>{r.bodyFat}%</div></div>}
                    {r.muscleMass && <div style={{background:"#09090c",borderRadius:6,padding:"6px 8px",textAlign:"center"}}><Mo c="#54546a" s={8}>근육량</Mo><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:"#00e5a0",marginTop:1}}>{r.muscleMass}kg</div></div>}
                    {r.bmi        && <div style={{background:"#09090c",borderRadius:6,padding:"6px 8px",textAlign:"center"}}><Mo c="#54546a" s={8}>BMI</Mo><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:"#7c6fff",marginTop:1}}>{r.bmi}</div></div>}
                  </div>
                  {r.memo && <Mo c="#3a3a4a" s={9} style={{display:"block",marginTop:4}}>{r.memo}</Mo>}
                </div>
              ))}
            </Card>
          ) : (
            <div style={{textAlign:"center",padding:"32px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <Mo c="#2a2a3a" s={10}>인바디 기록이 없습니다. 위에서 추가해보세요!</Mo>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════
// 영양 관리 — 음식 DB & 상수
// ════════════════════════════════════════════

// 기본 음식 DB (추후 공공 API 교체 가능한 구조)
// per: 기준 분량, unit: 단위
const FOOD_DB = [
  {name:"흰쌀밥",        unit:"g",   per:100, cal:130, carb:28.0, protein:2.5,  fat:0.3},
  {name:"현미밥",        unit:"g",   per:100, cal:111, carb:23.0, protein:2.6,  fat:0.9},
  {name:"잡곡밥",        unit:"g",   per:100, cal:120, carb:25.0, protein:3.0,  fat:0.8},
  {name:"닭가슴살",      unit:"g",   per:100, cal:109, carb:0.0,  protein:23.0, fat:1.2},
  {name:"닭다리살",      unit:"g",   per:100, cal:173, carb:0.0,  protein:16.0, fat:11.0},
  {name:"소고기(우둔)",  unit:"g",   per:100, cal:143, carb:0.0,  protein:21.0, fat:6.5},
  {name:"돼지안심",      unit:"g",   per:100, cal:143, carb:0.0,  protein:22.0, fat:5.8},
  {name:"계란",          unit:"개",  per:1,   cal:75,  carb:0.6,  protein:6.3,  fat:5.0},
  {name:"계란흰자",      unit:"개",  per:1,   cal:17,  carb:0.2,  protein:3.6,  fat:0.1},
  {name:"연어",          unit:"g",   per:100, cal:208, carb:0.0,  protein:20.0, fat:13.0},
  {name:"참치캔(물)",    unit:"개",  per:1,   cal:100, carb:0.0,  protein:22.0, fat:1.0},
  {name:"고등어",        unit:"g",   per:100, cal:183, carb:0.0,  protein:19.0, fat:11.0},
  {name:"두부",          unit:"g",   per:100, cal:76,  carb:1.9,  protein:8.1,  fat:4.2},
  {name:"그릭요거트",    unit:"g",   per:100, cal:59,  carb:3.6,  protein:10.0, fat:0.4},
  {name:"우유",          unit:"ml",  per:200, cal:130, carb:9.4,  protein:6.6,  fat:7.6},
  {name:"고구마",        unit:"g",   per:100, cal:86,  carb:20.0, protein:1.6,  fat:0.1},
  {name:"감자",          unit:"g",   per:100, cal:66,  carb:15.0, protein:1.9,  fat:0.1},
  {name:"오트밀",        unit:"g",   per:100, cal:379, carb:67.0, protein:13.0, fat:7.0},
  {name:"바나나",        unit:"개",  per:1,   cal:89,  carb:23.0, protein:1.1,  fat:0.3},
  {name:"사과",          unit:"개",  per:1,   cal:95,  carb:25.0, protein:0.5,  fat:0.3},
  {name:"아몬드",        unit:"g",   per:30,  cal:174, carb:6.0,  protein:6.0,  fat:15.0},
  {name:"아보카도",      unit:"개",  per:1,   cal:234, carb:12.0, protein:3.0,  fat:21.0},
  {name:"브로콜리",      unit:"g",   per:100, cal:34,  carb:7.0,  protein:2.8,  fat:0.4},
  {name:"시금치",        unit:"g",   per:100, cal:23,  carb:3.6,  protein:2.9,  fat:0.4},
  {name:"토마토",        unit:"개",  per:1,   cal:22,  carb:4.8,  protein:1.1,  fat:0.2},
  {name:"프로틴",        unit:"스쿱",per:1,   cal:120, carb:5.0,  protein:25.0, fat:2.0},
  {name:"프로틴바",      unit:"개",  per:1,   cal:200, carb:20.0, protein:20.0, fat:7.0},
  {name:"돈까스",        unit:"인분",per:1,   cal:480, carb:35.0, protein:25.0, fat:22.0},
  {name:"국수",          unit:"그릇",per:1,   cal:420, carb:75.0, protein:12.0, fat:4.0},
  {name:"삼겹살",        unit:"인분",per:1,   cal:680, carb:0.0,  protein:28.0, fat:62.0},
  {name:"김밥",          unit:"줄",  per:1,   cal:300, carb:50.0, protein:9.0,  fat:7.0},
  {name:"샐러드",        unit:"팩",  per:1,   cal:80,  carb:8.0,  protein:4.0,  fat:3.0},
  {name:"닭가슴살 샐러드",unit:"팩", per:1,   cal:200, carb:10.0, protein:25.0, fat:6.0},
  {name:"비빔밥",        unit:"그릇",per:1,   cal:550, carb:85.0, protein:18.0, fat:12.0},
  {name:"된장찌개",      unit:"그릇",per:1,   cal:150, carb:10.0, protein:12.0, fat:5.0},
];

// 목표별 탄단지 비율 (칼로리 %)
const MACRO_RATIO = {
  "체중 감량":      {carb:35, protein:40, fat:25, calMult:0.85, label:"고단백 저탄"},
  "근육 증가":      {carb:45, protein:35, fat:20, calMult:1.10, label:"탄단 충분"},
  "체형 교정/건강": {carb:40, protein:30, fat:30, calMult:1.00, label:"균형 식단"},
  "대회 준비":      {carb:30, protein:50, fat:20, calMult:0.90, label:"초고단백"},
  "유지어터":       {carb:45, protein:25, fat:30, calMult:1.00, label:"균형 유지"},
};

const MEAL_TYPES  = ["아침","점심","저녁","간식","운동 전","운동 후"];
const MEAL_ICONS  = {"아침":"🌅","점심":"☀️","저녁":"🌙","간식":"🍎","운동 전":"⚡","운동 후":"💪"};
const MEAL_COL    = {"아침":"#ffd166","점심":"#ff9f43","저녁":"#7c6fff","간식":"#00e5a0","운동 전":"#ff6b6b","운동 후":"#54a0ff"};

const SUPP_PRESETS = ["멀티비타민","오메가3","크레아틴","EAA","BCAA","프리워크아웃","프로틴","타트체리","양배추 추출물","전해질","베타알라닌","시트룰린"];

function detectAccuracy(unit) {
  if (!unit) return "낮음";
  const u = unit.toLowerCase();
  if (["g","ml","mg"].some(s => u.includes(s))) return "높음";
  if (["개","알","장","봉","스쿱","캔","팩"].some(s => u.includes(s))) return "중간";
  return "낮음";
}
const ACC_COLOR = {"높음":"#00e5a0","중간":"#ffd166","낮음":"#ff9f43"};

function getSupplFeedback(supps) {
  const out = [];
  const names = supps.map(s => (s.name||"").toLowerCase());
  if (names.some(n => n.includes("프리워크아웃")))
    out.push({text:"프리워크아웃 섭취일입니다. 총 카페인 섭취량을 확인해주세요.",color:"#ff6b6b"});
  if (names.some(n => n.includes("크레아틴")))
    out.push({text:"크레아틴 섭취 중이라면 체중 증가가 수분 보유 때문일 수 있습니다.",color:"#54a0ff"});
  if (names.some(n => n.includes("프로틴") || n.includes("웨이")))
    out.push({text:"단백질 보충제 섭취일입니다. 식사 단백질과 합산해 목표량을 확인해주세요.",color:"#00e5a0"});
  if (names.some(n => n.includes("eaa") || n.includes("bcaa")))
    out.push({text:"EAA/BCAA는 단백질 섭취 부족 시 보조적으로 활용할 수 있습니다.",color:"#ffd166"});
  if (names.some(n => n.includes("멀티비타민") || n.includes("비타민")))
    out.push({text:"멀티비타민은 식사 대체가 아닙니다. 채소·과일도 함께 기록해주세요.",color:"#a29bfe"});
  return out;
}

// ════════════════════════════════════════════
// NUTRITION SCREEN
// ════════════════════════════════════════════
function NutritionScreen({ member, onBack, nutritionData, onSaveNutrition, showToast, targetCal }) {
  const [tab,         setTab]       = useState("오늘");
  const [selDate,     setSelDate]   = useState(new Date().toISOString().split("T")[0]);
  const [addMeal,     setAddMeal]   = useState("아침");
  const [saving,      setSaving]    = useState(false);
  const [showAdd,     setShowAdd]   = useState(false);

  const [fsearch,  setFsearch]  = useState("");
  const [selFood,  setSelFood]  = useState(null);
  const [famount,  setFamount]  = useState("");
  const [funit,    setFunit]    = useState("g");
  const [isManual, setIsManual] = useState(false);
  const [mCal,     setMCal]     = useState("");
  const [mCarb,    setMCarb]    = useState("");
  const [mProt,    setMProt]    = useState("");
  const [mFat,     setMFat]     = useState("");

  const [sName,   setSName]   = useState("");
  const [sTime,   setSTime]   = useState("");
  const [sAmt,    setSAmt]    = useState("");
  const [sPurp,   setSPurp]   = useState("");
  const [sCaff,   setSCaff]   = useState("");
  const [sCrea,   setSCrea]   = useState("");
  const [sProt,   setSProt]   = useState("");
  const [sMemo,   setSMemo]   = useState("");

  const nutGoal  = nutritionData?.goal   || "체중 감량";
  const favFoods = nutritionData?.favFoods || [];
  const dateData = nutritionData?.dates?.[selDate] || {meals:{}, supplements:[]};
  const mr       = MACRO_RATIO[nutGoal] || MACRO_RATIO["체중 감량"];

  function getMealFoods(mt) { return dateData.meals?.[mt] || []; }
  function getMealNut(mt) {
    return getMealFoods(mt).reduce((a,f) => ({
      cal:a.cal+(f.cal||0), carb:a.carb+(f.carb||0),
      protein:a.protein+(f.protein||0), fat:a.fat+(f.fat||0)
    }), {cal:0,carb:0,protein:0,fat:0});
  }
  const totals = MEAL_TYPES.reduce((a,mt) => {
    const n=getMealNut(mt);
    return {cal:a.cal+n.cal, carb:a.carb+n.carb, protein:a.protein+n.protein, fat:a.fat+n.fat};
  }, {cal:0,carb:0,protein:0,fat:0});

  const suppTotals = (dateData.supplements||[]).reduce((a,s) => ({
    caffeine: a.caffeine+(parseFloat(s.caffeine)||0),
    creatine: a.creatine+(parseFloat(s.creatine)||0),
    protein:  a.protein +(parseFloat(s.protein) ||0),
  }), {caffeine:0,creatine:0,protein:0});

  const totalProtein = totals.protein + suppTotals.protein;
  const tCal     = targetCal ? Math.round(targetCal) : 2000;
  const tCarb    = Math.round(tCal * mr.carb    / 100 / 4);
  const tProtein = Math.round(tCal * mr.protein / 100 / 4);
  const tFat     = Math.round(tCal * mr.fat     / 100 / 9);

  const totalMacroCal = totals.carb*4 + totals.protein*4 + totals.fat*9;
  const carbPct    = totalMacroCal>0 ? Math.round(totals.carb*4/totalMacroCal*100)    : 0;
  const proteinPct = totalMacroCal>0 ? Math.round(totals.protein*4/totalMacroCal*100) : 0;
  const fatPct     = totalMacroCal>0 ? Math.round(totals.fat*9/totalMacroCal*100)     : 0;

  function getDietFeedback() {
    if (totals.cal < 100) return [];
    const out = [];
    const diff = totals.cal - tCal;
    if (diff < -100) out.push({text:"오늘은 권장 칼로리보다 "+Math.abs(Math.round(diff))+"kcal 적게 섭취했습니다.",color:"#ffd166"});
    else if (diff > 100) out.push({text:"오늘은 권장 칼로리보다 "+Math.round(diff)+"kcal 초과 섭취했습니다.",color:"#ff6b6b"});
    else out.push({text:"오늘 칼로리 섭취가 목표 범위 내에 있습니다!",color:"#00e5a0"});
    const pd = tProtein - totalProtein;
    if (pd > 10) out.push({text:"단백질 섭취가 목표보다 "+Math.round(pd)+"g 부족합니다. 닭가슴살·계란·프로틴을 추가해보세요.",color:"#ff9f43"});
    else if (pd < -10) out.push({text:"단백질 섭취가 충분합니다!",color:"#00e5a0"});
    if (carbPct < mr.carb-10) out.push({text:"탄수화물 비율이 낮아 운동 퍼포먼스 저하가 생길 수 있습니다.",color:"#ffd166"});
    if (fatPct > mr.fat+10) out.push({text:"지방 섭취가 높은 편입니다. 다음 식사는 저지방 단백질 위주로 구성해보세요.",color:"#ff9f43"});
    return out;
  }

  const dietFb  = getDietFeedback();
  const suppFb  = getSupplFeedback(dateData.supplements||[]);
  const srList  = fsearch.length>0 ? FOOD_DB.filter(f => f.name.includes(fsearch)).slice(0,8) : [];

  function calcCurNut() {
    if (isManual) return {cal:parseFloat(mCal)||0, carb:parseFloat(mCarb)||0, protein:parseFloat(mProt)||0, fat:parseFloat(mFat)||0};
    if (!selFood||!famount) return null;
    const r = (parseFloat(famount)||0) / selFood.per;
    return {cal:Math.round(selFood.cal*r), carb:Math.round(selFood.carb*r*10)/10, protein:Math.round(selFood.protein*r*10)/10, fat:Math.round(selFood.fat*r*10)/10};
  }

  function resetFoodForm() {
    setFsearch(""); setSelFood(null); setFamount(""); setFunit("g");
    setIsManual(false); setMCal(""); setMCarb(""); setMProt(""); setMFat("");
  }

  async function addFood() {
    const nut = calcCurNut();
    const name = isManual ? fsearch : selFood?.name;
    if (!name) { showToast("음식명을 입력해주세요","err"); return; }
    if (!nut) { showToast("영양 정보를 입력해주세요","err"); return; }
    const unit = isManual ? funit : selFood?.unit || "g";
    const acc  = detectAccuracy(unit);
    const food = {id:"f"+Date.now(), name, amount:famount, unit, ...nut, accuracy:acc};
    const nd = {
      ...(nutritionData?.dates||{}),
      [selDate]: {
        ...dateData,
        meals: {...(dateData.meals||{}), [addMeal]: [...(dateData.meals?.[addMeal]||[]), food]}
      }
    };
    setSaving(true);
    await onSaveNutrition({...nutritionData, dates:nd});
    showToast("음식 추가 완료 ✓");
    resetFoodForm(); setShowAdd(false); setSaving(false); setTab("오늘");
  }

  async function removeFood(mt, fid) {
    const nf = (dateData.meals?.[mt]||[]).filter(f => f.id!==fid);
    const nd = {...(nutritionData?.dates||{}), [selDate]:{...dateData, meals:{...(dateData.meals||{}), [mt]:nf}}};
    await onSaveNutrition({...nutritionData, dates:nd});
  }

  async function addFav() {
    const nut = calcCurNut();
    const name = isManual ? fsearch : selFood?.name;
    if (!name||!nut) { showToast("음식 정보를 먼저 입력해주세요","err"); return; }
    const unit = isManual ? funit : selFood?.unit || "g";
    const fav = {id:"fav"+Date.now(), name, amount:famount, unit, ...nut, accuracy:detectAccuracy(unit)};
    await onSaveNutrition({...nutritionData, favFoods:[...favFoods, fav]});
    showToast("즐겨찾기 추가 완료 ✓");
  }

  async function removeFav(fid) {
    await onSaveNutrition({...nutritionData, favFoods:favFoods.filter(f=>f.id!==fid)});
  }

  function applyFav(fav) {
    setIsManual(true); setFsearch(fav.name); setFamount(String(fav.amount||""));
    setFunit(fav.unit||"g"); setMCal(String(fav.cal||"")); setMCarb(String(fav.carb||""));
    setMProt(String(fav.protein||"")); setMFat(String(fav.fat||""));
    setSelFood(null); setTab("기록"); setShowAdd(true);
  }

  async function addSupp() {
    if (!sName) { showToast("제품명을 입력해주세요","err"); return; }
    const supp = {id:"s"+Date.now(), name:sName, time:sTime, amount:sAmt, purpose:sPurp, caffeine:sCaff, creatine:sCrea, protein:sProt, memo:sMemo};
    const nd = {...(nutritionData?.dates||{}), [selDate]:{...dateData, supplements:[...(dateData.supplements||[]), supp]}};
    setSaving(true);
    await onSaveNutrition({...nutritionData, dates:nd});
    showToast("보충제 기록 완료 ✓");
    setSName(""); setSTime(""); setSAmt(""); setSPurp(""); setSCaff(""); setSCrea(""); setSProt(""); setSMemo("");
    setSaving(false);
  }

  async function removeSupp(sid) {
    const nd = {...(nutritionData?.dates||{}), [selDate]:{...dateData, supplements:(dateData.supplements||[]).filter(s=>s.id!==sid)}};
    await onSaveNutrition({...nutritionData, dates:nd});
  }

  async function saveGoal(g) {
    await onSaveNutrition({...nutritionData, goal:g});
    showToast("목표 변경 완료 ✓");
  }

  const TABS = [{key:"오늘",icon:"📊"},{key:"기록",icon:"✏️"},{key:"영양제",icon:"💊"},{key:"즐겨찾기",icon:"⭐"}];
  const tt = {background:"#111116",border:"1px solid #1a1a24",borderRadius:8,fontFamily:"'DM Mono',monospace",fontSize:11};
  const curNut = calcCurNut();

  function MacroBar({label, val, target, color}) {
    const pct = target>0 ? Math.min(100, (val/target)*100) : 0;
    const over = val > target;
    return (
      <div style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <Mo c="#54546a" s={9}>{label}</Mo>
          <Mo c={over?"#ff6b6b":color} s={10}>{Math.round(val)} / {target}g</Mo>
        </div>
        <div style={{height:5,background:"#1a1a24",borderRadius:3}}>
          <div style={{height:"100%",width:pct+"%",background:over?"#ff6b6b":color,borderRadius:3,transition:"width .4s"}} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SH title="🥗 영양 관리" sub={member.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />

      <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:2}}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{padding:"7px 14px",borderRadius:20,border:"1px solid",flexShrink:0,cursor:"pointer",
              borderColor:tab===t.key?"#00e5a0":"#1a1a24",
              background:tab===t.key?"rgba(0,229,160,.12)":"transparent",
              color:tab===t.key?"#00e5a0":"#54546a",fontSize:12,fontWeight:700}}>
            {t.icon} {t.key}
          </button>
        ))}
      </div>

      {tab === "오늘" && (
        <div>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
              style={{flex:1,fontSize:13,padding:"7px 10px"}} />
            <div>
              <label style={{marginBottom:0,fontSize:9}}>목표</label>
              <select value={nutGoal} onChange={e => saveGoal(e.target.value)} style={{fontSize:11,padding:"6px 8px",width:"auto"}}>
                {Object.keys(MACRO_RATIO).map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {totals.cal === 0 && (
            <div style={{textAlign:"center",padding:"28px 16px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24",marginBottom:12}}>
              <div style={{fontSize:32,marginBottom:8}}>🍽️</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#54546a",marginBottom:6}}>오늘 식단 기록이 없습니다</div>
              <Mo c="#2a2a3a" s={10}>기록 탭에서 음식을 추가해보세요.</Mo>
              <div style={{marginTop:12}}><Btn sm onClick={() => { setTab("기록"); setShowAdd(true); }}>+ 음식 추가</Btn></div>
            </div>
          )}

          {totals.cal > 0 && (
            <div>
              <Card style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <Mo c="#54546a" s={9}>오늘 총 섭취 칼로리</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:30,color:"#fff",marginTop:2}}>
                      {Math.round(totals.cal).toLocaleString()}<span style={{fontSize:13,color:"#54546a",fontWeight:400}}> kcal</span>
                    </div>
                    <Mo c={totals.cal>tCal?"#ff6b6b":"#00e5a0"} s={10}>
                      목표 {tCal.toLocaleString()} kcal ({totals.cal>tCal?"+":""}{Math.round(totals.cal-tCal)})
                    </Mo>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <Mo c="#54546a" s={8}>탄단지 비율</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#fff",marginTop:4}}>
                      <span style={{color:"#ffd166"}}>{carbPct}%</span>
                      <span style={{color:"#54546a"}}> · </span>
                      <span style={{color:"#00e5a0"}}>{proteinPct}%</span>
                      <span style={{color:"#54546a"}}> · </span>
                      <span style={{color:"#ff9f43"}}>{fatPct}%</span>
                    </div>
                    <Mo c="#3a3a4a" s={8}>탄 · 단 · 지</Mo>
                    <div style={{marginTop:6,padding:"4px 8px",background:"rgba(0,229,160,.1)",borderRadius:6,border:"1px solid rgba(0,229,160,.2)"}}>
                      <Mo c="#00e5a0" s={9}>{mr.label}</Mo>
                    </div>
                  </div>
                </div>

                <MacroBar label="탄수화물" val={totals.carb}           target={tCarb}    color="#ffd166" />
                <MacroBar label={"단백질 (보충제 포함)"} val={totalProtein} target={tProtein} color="#00e5a0" />
                <MacroBar label="지방"     val={totals.fat}            target={tFat}     color="#ff9f43" />

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:10}}>
                  {[
                    {label:"탄수화물",val:Math.round(totals.carb)+"g",   color:"#ffd166"},
                    {label:"단백질",  val:Math.round(totalProtein)+"g",  color:"#00e5a0"},
                    {label:"지방",    val:Math.round(totals.fat)+"g",    color:"#ff9f43"},
                    {label:"식사 수", val:MEAL_TYPES.filter(mt=>getMealFoods(mt).length>0).length+"끼",color:"#7c6fff"},
                  ].map(({label,val,color}) => (
                    <div key={label} style={{background:"#09090c",borderRadius:8,padding:"7px 8px",textAlign:"center"}}>
                      <Mo c="#54546a" s={8}>{label}</Mo>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color,marginTop:2}}>{val}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {MEAL_TYPES.filter(mt => getMealFoods(mt).length > 0).map(mt => {
                const foods = getMealFoods(mt);
                const mNut  = getMealNut(mt);
                const col   = MEAL_COL[mt];
                return (
                  <Card key={mt} style={{marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:16}}>{MEAL_ICONS[mt]}</span>
                        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:col}}>{mt}</span>
                        <Mo c="#54546a" s={9}>{foods.length}가지</Mo>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <Mo c={col} s={11}>{Math.round(mNut.cal)} kcal</Mo>
                        <button onClick={() => { setAddMeal(mt); setTab("기록"); setShowAdd(true); }}
                          style={{background:"none",border:"1px solid "+col+"44",borderRadius:5,color:col,fontSize:9,fontWeight:700,padding:"3px 8px",cursor:"pointer"}}>+</button>
                      </div>
                    </div>
                    {foods.map((f,i) => (
                      <div key={f.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderTop:"1px solid #1a1a24"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                            <span style={{fontSize:12,color:"#ddddf0",fontWeight:600}}>{f.name}</span>
                            {f.amount && <Mo c="#3a3a4a" s={9}>{f.amount}{f.unit}</Mo>}
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"1px 5px",borderRadius:3,
                              background:ACC_COLOR[f.accuracy||"낮음"]+"22",color:ACC_COLOR[f.accuracy||"낮음"]}}>
                              정확도 {f.accuracy||"낮음"}{f.accuracy==="낮음"?" (예상값)":""}
                            </span>
                          </div>
                          <Mo c="#54546a" s={9}>탄 {f.carb}g · 단 {f.protein}g · 지 {f.fat}g</Mo>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <Mo c="#ffd166" s={10}>{Math.round(f.cal)} kcal</Mo>
                          <button onClick={() => removeFood(mt,f.id)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:13,cursor:"pointer"}}>✕</button>
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })}

              {suppFb.length > 0 && (
                <Card title="💊 보충제 피드백" style={{marginBottom:11}}>
                  {suppFb.map((fb,i) => (
                    <div key={i} style={{padding:"7px 10px",borderRadius:7,border:"1px solid "+fb.color+"33",background:fb.color+"0d",marginBottom:i<suppFb.length-1?6:0}}>
                      <div style={{fontSize:12,color:fb.color,fontWeight:600}}>{fb.text}</div>
                    </div>
                  ))}
                </Card>
              )}

              {dietFb.length > 0 && (
                <Card title="🧠 오늘의 식단 피드백" style={{marginBottom:11}}>
                  {dietFb.map((fb,i) => (
                    <div key={i} style={{padding:"8px 11px",borderRadius:8,border:"1px solid "+fb.color+"33",background:fb.color+"0d",marginBottom:i<dietFb.length-1?7:0}}>
                      <div style={{fontSize:12,color:fb.color,fontWeight:600,lineHeight:1.6}}>{fb.text}</div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          <div style={{marginBottom:11}}>
            <Btn full onClick={() => { setTab("기록"); setShowAdd(true); }}>+ 음식 기록 추가</Btn>
          </div>
        </div>
      )}

      {tab === "기록" && (
        <div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {MEAL_TYPES.map(mt => (
              <button key={mt} onClick={() => setAddMeal(mt)}
                style={{padding:"6px 12px",borderRadius:16,border:"1px solid",flexShrink:0,cursor:"pointer",
                  borderColor:addMeal===mt?MEAL_COL[mt]:"#1a1a24",
                  background:addMeal===mt?MEAL_COL[mt]+"22":"transparent",
                  color:addMeal===mt?MEAL_COL[mt]:"#54546a",fontSize:11,fontWeight:700}}>
                {MEAL_ICONS[mt]} {mt}
              </button>
            ))}
          </div>

          <Card title={"✏️ "+addMeal+" 기록"}>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {[false,true].map(m => (
                <button key={String(m)} onClick={() => { setIsManual(m); setSelFood(null); }}
                  style={{flex:1,padding:"7px",borderRadius:7,border:"1px solid",cursor:"pointer",
                    borderColor:isManual===m?"#00e5a0":"#1a1a24",
                    background:isManual===m?"rgba(0,229,160,.1)":"transparent",
                    color:isManual===m?"#00e5a0":"#54546a",fontSize:11,fontWeight:700}}>
                  {m ? "🖊 직접 입력" : "🔍 음식 검색"}
                </button>
              ))}
            </div>

            {!isManual && (
              <div style={{marginBottom:10}}>
                <Field label="음식 검색" value={fsearch} onChange={v => { setFsearch(v); setSelFood(null); }} placeholder="예: 닭가슴살, 현미밥" />
                {srList.length > 0 && !selFood && (
                  <div style={{background:"#09090c",borderRadius:8,border:"1px solid #1a1a24",marginTop:4,overflow:"hidden"}}>
                    {srList.map((f,i) => (
                      <button key={i} onClick={() => { setSelFood(f); setFsearch(f.name); setFamount(String(f.per)); setFunit(f.unit); }}
                        style={{width:"100%",padding:"9px 12px",background:"transparent",border:"none",borderBottom:i<srList.length-1?"1px solid #1a1a24":"none",
                          color:"#ddddf0",textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{f.name}</span>
                          <Mo c="#54546a" s={9} style={{marginLeft:8}}>기준 {f.per}{f.unit}</Mo>
                        </div>
                        <Mo c="#ffd166" s={10}>{f.cal} kcal</Mo>
                      </button>
                    ))}
                  </div>
                )}
                {selFood && (
                  <div style={{marginTop:8,padding:"8px 10px",background:"rgba(0,229,160,.08)",borderRadius:7,border:"1px solid rgba(0,229,160,.2)"}}>
                    <Mo c="#00e5a0" s={9}>선택됨: {selFood.name}</Mo>
                    <Mo c="#54546a" s={9} style={{marginLeft:8}}>({selFood.cal}kcal / {selFood.per}{selFood.unit})</Mo>
                  </div>
                )}
              </div>
            )}

            {isManual && (
              <div style={{marginBottom:10}}>
                <Field label="음식명 *" value={fsearch} onChange={setFsearch} placeholder="예: 돈까스, 국수 1그릇" />
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:10}}>
              <Field label={isManual?"분량":"섭취량"} value={famount} onChange={setFamount} placeholder={selFood?String(selFood.per):"100"} />
              <div>
                <label>단위</label>
                {isManual ? (
                  <select value={funit} onChange={e => setFunit(e.target.value)}>
                    {["g","ml","개","스쿱","인분","그릇","팩","컵","장","봉","캔","줄"].map(u => <option key={u}>{u}</option>)}
                  </select>
                ) : (
                  <div style={{background:"#111116",border:"1px solid #21212a",borderRadius:7,padding:"8px 12px",fontSize:13,color:"#54546a"}}>
                    {selFood?.unit || "—"}
                  </div>
                )}
              </div>
            </div>

            {isManual && (
              <div>
                <Mo c="#54546a" s={9} style={{display:"block",marginBottom:6}}>영양 정보 직접 입력</Mo>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:10}}>
                  <Field label="칼로리 (kcal)" value={mCal}  onChange={setMCal}  placeholder="200" />
                  <Field label="탄수화물 (g)"  value={mCarb} onChange={setMCarb} placeholder="30" />
                  <Field label="단백질 (g)"    value={mProt} onChange={setMProt} placeholder="20" />
                  <Field label="지방 (g)"      value={mFat}  onChange={setMFat}  placeholder="5" />
                </div>
              </div>
            )}

            {curNut && (
              <div style={{background:"linear-gradient(135deg,#0d2018,#09090c)",border:"1px solid rgba(0,229,160,.2)",borderRadius:9,padding:"10px 13px",marginBottom:12}}>
                <Mo c="#54546a" s={9}>계산된 영양 정보</Mo>
                <div style={{display:"flex",gap:12,marginTop:5,flexWrap:"wrap"}}>
                  <div><Mo c="#ffd166" s={13}>{Math.round(curNut.cal)} kcal</Mo></div>
                  <div><Mo c="#54546a" s={9}>탄 </Mo><Mo c="#ffd166" s={11}>{curNut.carb}g</Mo></div>
                  <div><Mo c="#54546a" s={9}>단 </Mo><Mo c="#00e5a0" s={11}>{curNut.protein}g</Mo></div>
                  <div><Mo c="#54546a" s={9}>지 </Mo><Mo c="#ff9f43" s={11}>{curNut.fat}g</Mo></div>
                  <div>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,padding:"2px 6px",borderRadius:3,
                      background:ACC_COLOR[detectAccuracy(isManual?funit:selFood?.unit||"")]+"22",
                      color:ACC_COLOR[detectAccuracy(isManual?funit:selFood?.unit||"")]}}>
                      정확도 {detectAccuracy(isManual?funit:selFood?.unit||"")}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <Btn full onClick={addFood} disabled={saving}>{saving?"저장 중...":"추가 →"}</Btn>
              <button onClick={addFav} style={{padding:"10px 14px",borderRadius:7,border:"1px solid #ffd166",background:"rgba(255,209,102,.1)",color:"#ffd166",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>⭐ 즐겨찾기</button>
            </div>
          </Card>

          {getMealFoods(addMeal).length > 0 && (
            <Card title={addMeal+" 기록 목록"} style={{marginTop:11}}>
              {getMealFoods(addMeal).map((f,i) => (
                <div key={f.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<getMealFoods(addMeal).length-1?"1px solid #1a1a24":"none"}}>
                  <div>
                    <div style={{fontSize:12,color:"#ddddf0",fontWeight:600}}>{f.name} {f.amount&&f.unit?f.amount+f.unit:""}</div>
                    <Mo c="#54546a" s={9}>탄 {f.carb}g · 단 {f.protein}g · 지 {f.fat}g</Mo>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Mo c="#ffd166" s={10}>{Math.round(f.cal)} kcal</Mo>
                    <button onClick={() => removeFood(addMeal,f.id)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:13,cursor:"pointer"}}>✕</button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === "영양제" && (
        <div>
          <Card title="💊 보충제 추가" style={{marginBottom:11}}>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              <div>
                <label>제품명</label>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {SUPP_PRESETS.slice(0,6).map(p => (
                    <button key={p} onClick={() => setSName(p)}
                      style={{padding:"4px 10px",borderRadius:14,border:"1px solid",cursor:"pointer",
                        borderColor:sName===p?"#00e5a0":"#1a1a24",
                        background:sName===p?"rgba(0,229,160,.12)":"transparent",
                        color:sName===p?"#00e5a0":"#54546a",fontSize:10,fontWeight:700}}>{p}</button>
                  ))}
                </div>
                <input value={sName} onChange={e => setSName(e.target.value)} placeholder="제품명 직접 입력" style={{width:"100%",fontSize:13}} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                <Field label="섭취 시간" type="time" value={sTime} onChange={setSTime} />
                <Field label="섭취량" value={sAmt} onChange={setSAmt} placeholder="1스쿱, 2정 등" />
              </div>
              <Field label="목적" value={sPurp} onChange={setSPurp} placeholder="근성장, 회복, 에너지 등" />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
                <Field label="카페인 (mg)" value={sCaff} onChange={setSCaff} placeholder="0" />
                <Field label="크레아틴 (g)" value={sCrea} onChange={setSCrea} placeholder="0" />
                <Field label="단백질 (g)" value={sProt} onChange={setSProt} placeholder="0" />
              </div>
              <TextArea label="메모" value={sMemo} onChange={setSMemo} placeholder="특이 성분, 복용 메모 등" />
              <Btn full onClick={addSupp} disabled={saving}>{saving?"저장 중...":"보충제 기록 →"}</Btn>
            </div>
          </Card>

          {(dateData.supplements||[]).length > 0 ? (
            <Card title="오늘 보충제 기록">
              {(dateData.supplements||[]).map((s,i) => (
                <div key={s.id||i} style={{padding:"10px 0",borderBottom:i<(dateData.supplements||[]).length-1?"1px solid #1a1a24":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#fff"}}>{s.name}</div>
                      <Mo c="#54546a" s={9}>{s.time&&s.time+" · "}{s.amount}{s.purpose?" · "+s.purpose:""}</Mo>
                    </div>
                    <button onClick={() => removeSupp(s.id)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:13,cursor:"pointer"}}>✕</button>
                  </div>
                  {(s.caffeine||s.creatine||s.protein) && (
                    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      {s.caffeine && <Mo c="#ff6b6b" s={9}>카페인 {s.caffeine}mg</Mo>}
                      {s.creatine && <Mo c="#54a0ff" s={9}>크레아틴 {s.creatine}g</Mo>}
                      {s.protein  && <Mo c="#00e5a0" s={9}>단백질 {s.protein}g</Mo>}
                    </div>
                  )}
                  {s.memo && <Mo c="#3a3a4a" s={9} style={{display:"block",marginTop:3}}>{s.memo}</Mo>}
                </div>
              ))}
              {(suppTotals.caffeine>0||suppTotals.creatine>0||suppTotals.protein>0) && (
                <div style={{marginTop:8,padding:"8px 10px",background:"#09090c",borderRadius:7,border:"1px solid #1a1a24",display:"flex",gap:10,flexWrap:"wrap"}}>
                  <Mo c="#54546a" s={9}>합계 </Mo>
                  {suppTotals.caffeine>0&&<Mo c="#ff6b6b" s={9}>카페인 {Math.round(suppTotals.caffeine)}mg</Mo>}
                  {suppTotals.creatine>0&&<Mo c="#54a0ff" s={9}>크레아틴 {Math.round(suppTotals.creatine)}g</Mo>}
                  {suppTotals.protein>0&&<Mo c="#00e5a0" s={9}>단백질 {Math.round(suppTotals.protein)}g</Mo>}
                </div>
              )}
            </Card>
          ) : (
            <div style={{textAlign:"center",padding:"28px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <Mo c="#2a2a3a" s={10}>오늘 보충제 기록이 없습니다.</Mo>
            </div>
          )}
        </div>
      )}

      {tab === "즐겨찾기" && (
        <div>
          {favFoods.length === 0 ? (
            <div style={{textAlign:"center",padding:"40px 16px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24",marginBottom:12}}>
              <div style={{fontSize:32,marginBottom:8}}>⭐</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#54546a",marginBottom:6}}>즐겨찾기 없음</div>
              <Mo c="#2a2a3a" s={10}>기록 탭에서 ⭐ 버튼을 눌러 자주 먹는 음식을 저장하세요.</Mo>
            </div>
          ) : (
            <Card title={"⭐ 즐겨찾는 음식 "+favFoods.length+"개"}>
              {favFoods.map((f,i) => (
                <div key={f.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<favFoods.length-1?"1px solid #1a1a24":"none"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#fff"}}>{f.name}</div>
                    <Mo c="#54546a" s={9}>{f.amount}{f.unit} · {Math.round(f.cal)}kcal · 탄{f.carb}g 단{f.protein}g 지{f.fat}g</Mo>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={() => applyFav(f)}
                      style={{padding:"4px 10px",borderRadius:5,border:"1px solid #00e5a0",background:"rgba(0,229,160,.1)",color:"#00e5a0",fontSize:10,fontWeight:700,cursor:"pointer"}}>사용</button>
                    <button onClick={() => removeFav(f.id)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:13,cursor:"pointer"}}>✕</button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}



// ════════════════════════════════════════════
// 근육통 & 루틴 분석 — 상수
// ════════════════════════════════════════════
const SORENESS_PARTS = ["가슴","등","어깨","하체","팔-이두근","팔-삼두근","복근/코어"];
const SORENESS_LABELS = ["없음","약함","가벼움","보통","강함","매우강함"];
const SORENESS_COLORS = ["#3a3a4a","#54a0ff","#00e5a0","#ffd166","#ff9f43","#ff6b6b"];

function rpeColor(rpe) {
  if (!rpe) return "#3a3a4a";
  if (rpe <= 4) return "#00e5a0";
  if (rpe <= 6) return "#ffd166";
  if (rpe <= 8) return "#ff9f43";
  return "#ff6b6b";
}
function rpeLabel(rpe) {
  const labels = ["","극저강도","매우 쉬움","쉬움","가벼움","보통","약간 힘듦","힘듦","매우 힘듦","한계 근접","한계"];
  return labels[rpe] || "";
}
function getSessionRPE(session) {
  const exs = session.exercises || [];
  const rpes = exs.map(e => e.rpe).filter(Boolean);
  if (!rpes.length) return null;
  return Math.round(rpes.reduce((a,b) => a+b, 0) / rpes.length * 10) / 10;
}
function getTotalSoreness(sd) {
  if (!sd) return 0;
  return Object.values(sd).reduce((a,b) => a+(b||0), 0);
}

// ════════════════════════════════════════════
// SORENESS SCREEN — 근육통 기록
// ════════════════════════════════════════════
function SorenessScreen({ member, sessions, onBack, onSaveSession, showToast }) {
  const today = new Date().toISOString().split("T")[0];
  const [selDate, setSelDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [soreness, setSoreness] = useState({});
  const [saving, setSaving] = useState(false);

  // 선택된 날짜의 수업 찾기
  const targetSession = sessions.find(s => s.date === selDate);

  // 이미 기록된 soreness 로드
  useState(() => {
    if (targetSession?.sorenessData) {
      setSoreness(targetSession.sorenessData);
    }
  });

  function selectSession(s) {
    setSelDate(s.date);
    setSoreness(s.sorenessData || {});
  }

  async function handleSave() {
    if (!targetSession) { showToast("날짜에 해당하는 수업이 없습니다","err"); return; }
    setSaving(true);
    try {
      await onSaveSession(targetSession.id, {
        ...targetSession,
        sorenessData:     soreness,
        sorenessRecordDate: today,
      });
      showToast("근육통 기록 완료 ✓");
    } catch(e) {
      showToast("저장 실패: "+e.message,"err");
    }
    setSaving(false);
  }

  const recentSessions = [...sessions].sort((a,b) => b.date.localeCompare(a.date)).slice(0,7);

  return (
    <div>
      <SH title="💢 근육통 기록" sub={member.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />

      {/* 수업 선택 */}
      <Card title="어떤 수업 이후 근육통인가요?" style={{marginBottom:12}}>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {recentSessions.map(s => {
            const hasSoreness = s.sorenessData && Object.values(s.sorenessData).some(v=>v>0);
            const isSelected = s.date === selDate;
            return (
              <button key={s.id} onClick={() => selectSession(s)}
                style={{padding:"10px 12px",borderRadius:8,border:"1px solid",
                  borderColor:isSelected?"#00e5a0":"#1a1a24",
                  background:isSelected?"rgba(0,229,160,.1)":"transparent",
                  textAlign:"left",cursor:"pointer",width:"100%"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <Mo c={isSelected?"#00e5a0":"#54546a"} s={9}>{s.date} · {s.sessionNo}회차</Mo>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,
                      color:isSelected?"#fff":"#7070a0",marginTop:2}}>{s.type||"웨이트"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {hasSoreness && <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:4,background:"rgba(255,107,107,.15)",color:"#ff9f43"}}>기록됨</span>}
                    {getSessionRPE(s) && <Mo c={rpeColor(getSessionRPE(s))} s={9}>RPE {getSessionRPE(s)}</Mo>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 부위별 근육통 선택 */}
      {targetSession && (
        <Card title={"💢 "+selDate+" 수업 — 근육통 강도"} style={{marginBottom:12}}>
          <Mo c="#54546a" s={9} style={{display:"block",marginBottom:12}}>0=없음 · 5=매우 강함 · 터치 한 번으로 선택</Mo>
          {SORENESS_PARTS.map(part => {
            const val = soreness[part] || 0;
            return (
              <div key={part} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#ddddf0"}}>{part}</span>
                  {val > 0 && <Mo c={SORENESS_COLORS[val]} s={9}>{SORENESS_LABELS[val]}</Mo>}
                </div>
                <div style={{display:"flex",gap:4}}>
                  {[0,1,2,3,4,5].map(n => {
                    const active = val === n;
                    const col = SORENESS_COLORS[n];
                    return (
                      <button key={n} onClick={() => setSoreness({...soreness,[part]:n})}
                        style={{flex:1,padding:"8px 0",borderRadius:6,border:"1px solid",cursor:"pointer",
                          borderColor:active?col:"#1a1a24",
                          background:active?col+"33":"transparent",
                          color:active?col:"#3a3a4a",
                          fontSize:11,fontWeight:800,transition:"all .15s"}}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{marginTop:8,padding:"8px 12px",background:"#09090c",borderRadius:7,border:"1px solid #1a1a24",display:"flex",justifyContent:"space-between"}}>
            <Mo c="#54546a" s={9}>총 근육통 점수</Mo>
            <Mo c="#ff9f43" s={11}>{getTotalSoreness(soreness)} / 30</Mo>
          </div>
          <div style={{marginTop:12}}>
            <Btn full onClick={handleSave} disabled={saving}>{saving?"저장 중...":"근육통 기록 저장 →"}</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// ROUTINE ANALYSIS SCREEN — 루틴 분석
// ════════════════════════════════════════════
function RoutineAnalysisScreen({ member, sessions, onBack }) {
  const [view, setView] = useState("overview");

  // 분석 데이터 계산
  const analyzed = sessions.map(s => ({
    ...s,
    avgRPE:       getSessionRPE(s),
    totalSoreness:getTotalSoreness(s.sorenessData),
    vol:          s.totalVolume || 0,
    exCount:      (s.exercises||[]).length,
  })).filter(s => s.vol > 0);

  // 1. 근육통 반응 TOP 세션
  const sorenessTop = [...analyzed]
    .filter(s => s.totalSoreness > 0)
    .sort((a,b) => b.totalSoreness - a.totalSoreness)
    .slice(0,5);

  // 2. RPE 대비 볼륨 효율 (볼륨 / RPE = 효율 점수)
  const rpeEfficiency = [...analyzed]
    .filter(s => s.avgRPE && s.vol > 0)
    .map(s => ({...s, effScore: Math.round(s.vol / s.avgRPE)}))
    .sort((a,b) => b.effScore - a.effScore)
    .slice(0,5);

  // 3. 근육통 + 볼륨 상관관계 (그래프용)
  const corrData = analyzed
    .filter(s => s.totalSoreness > 0 && s.vol > 0)
    .map(s => ({name:s.sessionNo+"회", vol:Math.round(s.vol/1000*10)/10, soreness:s.totalSoreness, rpe:s.avgRPE||0}))
    .slice(-10);

  // 4. 운동별 평균 RPE
  const exRPEMap = {};
  sessions.forEach(s => {
    (s.exercises||[]).forEach(ex => {
      if (!ex.name || !ex.rpe) return;
      if (!exRPEMap[ex.name]) exRPEMap[ex.name] = {total:0, count:0, vol:0};
      exRPEMap[ex.name].total += ex.rpe;
      exRPEMap[ex.name].count += 1;
      exRPEMap[ex.name].vol   += (ex.sets||[]).reduce((a,r)=>a+(r.volume||0),0);
    });
  });
  const exRPEList = Object.entries(exRPEMap)
    .map(([name,d]) => ({name, avgRPE:Math.round(d.total/d.count*10)/10, count:d.count, totalVol:d.vol}))
    .sort((a,b) => b.count - a.count)
    .slice(0,10);

  // 5. 부위별 누적 근육통
  const partSoreness = {};
  SORENESS_PARTS.forEach(p => { partSoreness[p] = 0; });
  sessions.forEach(s => {
    if (!s.sorenessData) return;
    Object.entries(s.sorenessData).forEach(([part, val]) => {
      if (partSoreness[part] !== undefined) partSoreness[part] += (val||0);
    });
  });
  const partList = Object.entries(partSoreness).sort((a,b)=>b[1]-a[1]);

  const VIEWS = [
    {key:"overview",  label:"📊 개요"},
    {key:"soreness",  label:"💢 근육통"},
    {key:"rpe",       label:"⚡ RPE"},
    {key:"exercise",  label:"🏋️ 운동별"},
  ];

  const tt = {background:"#111116",border:"1px solid #1a1a24",borderRadius:8,fontFamily:"'DM Mono',monospace",fontSize:11};

  function ScoreBar({label, val, max, color, sub}) {
    return (
      <div style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <Mo c="#ddddf0" s={10}>{label}</Mo>
          <div>
            {sub && <Mo c="#54546a" s={9} style={{marginRight:6}}>{sub}</Mo>}
            <Mo c={color} s={10}>{val}</Mo>
          </div>
        </div>
        <div style={{height:5,background:"#1a1a24",borderRadius:3}}>
          <div style={{height:"100%",width:Math.min(100,(val/max)*100)+"%",background:color,borderRadius:3,transition:"width .5s"}}/>
        </div>
      </div>
    );
  }

  const hasEnoughData = analyzed.length >= 2;

  return (
    <div>
      <SH title="📈 루틴 분석" sub={member.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />

      {!hasEnoughData && (
        <div style={{textAlign:"center",padding:"40px 16px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24",marginBottom:14}}>
          <div style={{fontSize:40,marginBottom:10}}>📊</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#54546a",marginBottom:6}}>분석 데이터 부족</div>
          <Mo c="#2a2a3a" s={10}>수업 기록이 2회 이상, RPE 또는 근육통 기록이 있어야 분석이 시작됩니다.</Mo>
        </div>
      )}

      {/* 탭 */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            style={{padding:"6px 12px",borderRadius:16,border:"1px solid",flexShrink:0,cursor:"pointer",
              borderColor:view===v.key?"#00e5a0":"#1a1a24",
              background:view===v.key?"rgba(0,229,160,.12)":"transparent",
              color:view===v.key?"#00e5a0":"#54546a",fontSize:11,fontWeight:700}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* 개요 */}
      {view === "overview" && (
        <div>
          <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:14}}>
            <StatTile label="총 수업" value={analyzed.length+"회"} />
            <StatTile label="RPE 기록" value={analyzed.filter(s=>s.avgRPE).length+"회"} />
            <StatTile label="근육통 기록" value={analyzed.filter(s=>s.totalSoreness>0).length+"회"} />
          </div>

          {corrData.length >= 2 && (
            <Card title="볼륨 · 근육통 · RPE 추이" style={{marginBottom:12}}>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={corrData} margin={{top:6,right:6,left:-22,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/>
                  <XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/>
                  <YAxis tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/>
                  <Tooltip contentStyle={tt}/>
                  <Legend wrapperStyle={{fontFamily:"'DM Mono',monospace",fontSize:8}}/>
                  <Line type="monotone" dataKey="vol"      stroke="#00e5a0" strokeWidth={2} dot={{r:3}} name="볼륨(t)"/>
                  <Line type="monotone" dataKey="soreness" stroke="#ff9f43" strokeWidth={2} dot={{r:3}} name="근육통"/>
                  <Line type="monotone" dataKey="rpe"      stroke="#ffd166" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="RPE"/>
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {rpeEfficiency.length > 0 && (
            <Card title="⚡ RPE 효율 베스트 세션" style={{marginBottom:12}}>
              <Mo c="#54546a" s={9} style={{display:"block",marginBottom:8}}>볼륨 ÷ RPE = 효율 점수 (높을수록 적은 힘으로 많은 볼륨)</Mo>
              {rpeEfficiency.map((s,i) => (
                <div key={s.id||i} style={{padding:"8px 0",borderBottom:i<rpeEfficiency.length-1?"1px solid #1a1a24":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <Mo c="#54546a" s={9}>{s.date} · {s.sessionNo}회차</Mo>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#fff",marginTop:1}}>{s.type||"웨이트"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#00e5a0"}}>{s.effScore.toLocaleString()}</div>
                      <Mo c="#54546a" s={8}>vol {(s.vol/1000).toFixed(1)}t · RPE {s.avgRPE}</Mo>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* 근육통 분석 */}
      {view === "soreness" && (
        <div>
          {sorenessTop.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <Mo c="#2a2a3a" s={10}>근육통 기록이 없습니다. 허브에서 💢 근육통 기록을 해주세요.</Mo>
            </div>
          ) : (
            <div>
              <Card title="💢 근육통 반응 TOP 세션" style={{marginBottom:12}}>
                {sorenessTop.map((s,i) => {
                  const parts = s.sorenessData ? Object.entries(s.sorenessData).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]) : [];
                  return (
                    <div key={s.id||i} style={{padding:"10px 0",borderBottom:i<sorenessTop.length-1?"1px solid #1a1a24":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div>
                          <Mo c="#54546a" s={9}>{s.date} · {s.sessionNo}회차</Mo>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#fff",marginTop:1}}>{s.type||"웨이트"}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#ff9f43"}}>{s.totalSoreness}<span style={{fontSize:10,color:"#54546a"}}>/30</span></div>
                          {s.avgRPE && <Mo c={rpeColor(s.avgRPE)} s={9}>RPE {s.avgRPE}</Mo>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {parts.map(([part,val]) => (
                          <span key={part} style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 7px",borderRadius:4,
                            background:SORENESS_COLORS[val]+"22",color:SORENESS_COLORS[val]}}>
                            {part} {val}
                          </span>
                        ))}
                      </div>
                      {/* 그 날의 운동 목록 */}
                      {(s.exercises||[]).length > 0 && (
                        <div style={{marginTop:5,display:"flex",gap:3,flexWrap:"wrap"}}>
                          {(s.exercises||[]).map((ex,j) => (
                            <span key={j} style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 6px",borderRadius:3,
                              background:(EQUIP_COLOR[ex.equipment]||"#888")+"22",color:EQUIP_COLOR[ex.equipment]||"#888"}}>
                              {ex.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>

              <Card title="부위별 누적 근육통" style={{marginBottom:12}}>
                <Mo c="#54546a" s={9} style={{display:"block",marginBottom:8}}>전체 기록 기준 부위별 합계</Mo>
                {partList.filter(([,v])=>v>0).map(([part,total]) => (
                  <ScoreBar key={part} label={part} val={total} max={partList[0]?.[1]||1} color="#ff9f43" sub={total+"점"} />
                ))}
                {partList.every(([,v])=>v===0) && <Emp msg="근육통 기록이 없습니다." />}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* RPE 분석 */}
      {view === "rpe" && (
        <div>
          {rpeEfficiency.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <Mo c="#2a2a3a" s={10}>RPE 기록이 없습니다. 수업 기록 시 각 운동의 RPE를 입력해주세요.</Mo>
            </div>
          ) : (
            <div>
              <Card title="⚡ RPE 분포" style={{marginBottom:12}}>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={analyzed.filter(s=>s.avgRPE).map(s=>({name:s.sessionNo+"회",rpe:s.avgRPE,vol:Math.round(s.vol/100)/10}))}
                    margin={{top:6,right:6,left:-22,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a24"/>
                    <XAxis dataKey="name" tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/>
                    <YAxis domain={[0,10]} tick={{fontFamily:"'DM Mono',monospace",fontSize:8,fill:"#54546a"}}/>
                    <Tooltip contentStyle={tt}/>
                    <Bar dataKey="rpe" fill="#ffd166" name="평균 RPE" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="⚡ RPE 효율 랭킹" style={{marginBottom:12}}>
                <Mo c="#54546a" s={9} style={{display:"block",marginBottom:8}}>같은 노력(RPE) 대비 볼륨이 높은 세션이 효율적</Mo>
                {rpeEfficiency.map((s,i) => (
                  <div key={s.id||i} style={{padding:"8px 0",borderBottom:i<rpeEfficiency.length-1?"1px solid #1a1a24":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:["#ffd166","#aaaaaa","#ff9f43","#54546a","#3a3a4a"][i]||"#3a3a4a"}}>
                            {i+1}위
                          </span>
                          <Mo c="#54546a" s={9}>{s.date} · {s.sessionNo}회차</Mo>
                        </div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:"#fff",marginTop:1}}>{s.type||"웨이트"}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#00e5a0"}}>{s.effScore.toLocaleString()}</div>
                        <Mo c="#54546a" s={8}>RPE {s.avgRPE} · {(s.vol/1000).toFixed(1)}t</Mo>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>

              {/* RPE vs 근육통 */}
              {sorenessTop.length > 0 && (
                <Card title="RPE vs 근육통 반응" style={{marginBottom:12}}>
                  <Mo c="#54546a" s={9} style={{display:"block",marginBottom:8}}>낮은 RPE에서 높은 근육통 = 효율적 자극</Mo>
                  {[...analyzed].filter(s=>s.avgRPE&&s.totalSoreness>0)
                    .sort((a,b)=>(b.totalSoreness/b.avgRPE)-(a.totalSoreness/a.avgRPE))
                    .slice(0,5)
                    .map((s,i) => {
                      const ratio = (s.totalSoreness/s.avgRPE).toFixed(1);
                      return (
                        <div key={s.id||i} style={{padding:"7px 0",borderBottom:i<4?"1px solid #1a1a24":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <Mo c="#54546a" s={9}>{s.date} · {s.sessionNo}회차</Mo>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:"#fff",marginTop:1}}>{s.type||"웨이트"}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <Mo c="#ff9f43" s={10}>근육통 {s.totalSoreness}</Mo>
                            <Mo c="#ffd166" s={10} style={{marginLeft:6}}>RPE {s.avgRPE}</Mo>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#7c6fff"}}>{ratio}</div>
                          </div>
                        </div>
                      );
                    })
                  }
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* 운동별 분석 */}
      {view === "exercise" && (
        <div>
          {exRPEList.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <Mo c="#2a2a3a" s={10}>RPE가 기록된 운동이 없습니다.</Mo>
            </div>
          ) : (
            <div>
              <Card title="🏋️ 운동별 평균 RPE" style={{marginBottom:12}}>
                <Mo c="#54546a" s={9} style={{display:"block",marginBottom:10}}>자주 한 운동과 평균 RPE · 총 볼륨</Mo>
                {exRPEList.map((ex,i) => {
                  const col = rpeColor(ex.avgRPE);
                  return (
                    <div key={i} style={{padding:"9px 0",borderBottom:i<exRPEList.length-1?"1px solid #1a1a24":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#fff"}}>{ex.name}</span>
                          <Mo c="#54546a" s={9} style={{marginLeft:8}}>{ex.count}회 수행</Mo>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:col}}>RPE {ex.avgRPE}</span>
                          <Mo c="#54546a" s={9} style={{marginLeft:6}}>{rpeLabel(Math.round(ex.avgRPE))}</Mo>
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{flex:1,height:4,background:"#1a1a24",borderRadius:2,marginRight:8}}>
                          <div style={{height:"100%",width:(ex.avgRPE/10*100)+"%",background:col,borderRadius:2}}/>
                        </div>
                        <Mo c="#00e5a0" s={9}>{(ex.totalVol/1000).toFixed(1)}t</Mo>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// ════════════════════════════════════════════
// 평가 기록 — 바디맵 & 상수
// ════════════════════════════════════════════

// 상태 정의
// ════════════════════════════════════════════
// 해부학 기반 바디맵 — 의료/재활 스타일
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// 이미지 기반 바디맵 — 실제 해부도 위에 클릭 영역 오버레이
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// 이미지 기반 바디맵 — 실제 해부도 오버레이
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// 이미지 기반 바디맵 v3 — 분리 이미지 + 정확한 클릭 영역
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// 해부학 기반 순수 SVG 바디맵 v1.0
// - PNG/JPG 오버레이 없음
// - 의료/재활 차트 스타일
// - viewBox "0 0 160 420"
// ════════════════════════════════════════════


// ════════════════════════════════════════════
// 해부학 기반 순수 SVG 바디맵 v1.0
// - PNG/JPG 오버레이 없음
// - 의료/재활 차트 스타일
// - viewBox "0 0 160 420"
// ════════════════════════════════════════════

// 이미지 크기: 304 x 534 픽셀 (전면/후면 동일)
// viewBox: "0 0 304 534"
// 클릭 영역은 실제 이미지 픽셀 좌표 기반


// ════════════════════════════════════════════
// 의료/물리치료 바디차트 — 정밀 SVG v2
// viewBox: "0 0 200 520" (전면/후면 공통)
// 스타일: 얇은 라인, 흰 배경, 실제 인체 비율
// ════════════════════════════════════════════

const BODY_STATUS = {
  tight: { label:"타이트 / 과긴장", color:"#dc2626", fill:"rgba(220,38,38,0.48)" },
  weak:  { label:"약화 / 기능저하", color:"#2563eb", fill:"rgba(37,99,235,0.48)" },
};

// ── 전면 근육 클릭 영역 (200x520 기준) ──────────
const FRONT_MUSCLES = [
  { id:"ant_delt_l",  label:"전면삼각근L",
    d:"M38 78 Q24 88 22 108 Q24 126 38 132 Q52 128 58 110 Q60 90 50 78 Z" },
  { id:"ant_delt_r",  label:"전면삼각근R",
    d:"M162 78 Q176 88 178 108 Q176 126 162 132 Q148 128 142 110 Q140 90 150 78 Z" },
  { id:"pec_l",       label:"대흉근L",
    d:"M58 78 Q44 86 40 106 Q42 128 58 138 Q76 144 94 136 Q102 124 100 102 L100 80 Q82 72 68 72 Z" },
  { id:"pec_r",       label:"대흉근R",
    d:"M142 78 Q156 86 160 106 Q158 128 142 138 Q124 144 106 136 Q98 124 100 102 L100 80 Q118 72 132 72 Z" },
  { id:"biceps_l",    label:"이두근L",
    d:"M20 132 Q12 152 12 174 Q16 192 28 198 Q40 196 46 178 Q50 158 46 134 Q38 124 28 126 Z" },
  { id:"biceps_r",    label:"이두근R",
    d:"M180 132 Q188 152 188 174 Q184 192 172 198 Q160 196 154 178 Q150 158 154 134 Q162 124 172 126 Z" },
  { id:"forearm_l",   label:"전완굴곡L",
    d:"M10 200 Q4 222 6 248 Q10 264 22 268 Q34 266 40 248 Q44 224 42 202 Q34 192 20 194 Z" },
  { id:"forearm_r",   label:"전완굴곡R",
    d:"M190 200 Q196 222 194 248 Q190 264 178 268 Q166 266 160 248 Q156 224 158 202 Q166 192 180 194 Z" },
  { id:"rect_ab",     label:"복직근",
    d:"M88 138 Q84 158 84 188 Q84 218 88 238 Q94 252 100 254 Q106 252 112 238 Q116 218 116 188 Q116 158 112 138 Z" },
  { id:"ext_obl_l",   label:"외복사근L",
    d:"M58 138 Q48 160 47 190 Q48 218 58 234 Q70 244 86 242 Q88 228 88 208 Q88 174 86 152 Q80 132 68 130 Z" },
  { id:"ext_obl_r",   label:"외복사근R",
    d:"M142 138 Q152 160 153 190 Q152 218 142 234 Q130 244 114 242 Q112 228 112 208 Q112 174 114 152 Q120 132 132 130 Z" },
  { id:"hip_flex_l",  label:"장요근L",
    d:"M86 246 Q78 260 76 276 Q78 290 88 294 Q99 292 104 278 Q106 262 100 248 Z" },
  { id:"hip_flex_r",  label:"장요근R",
    d:"M114 246 Q122 260 124 276 Q122 290 112 294 Q101 292 96 278 Q94 262 100 248 Z" },
  { id:"adduct_l",    label:"내전근L",
    d:"M100 292 Q93 310 93 342 Q94 366 99 380 Q106 388 112 384 Q116 370 116 342 Q116 312 112 294 Z" },
  { id:"adduct_r",    label:"내전근R",
    d:"M100 292 Q107 310 107 342 Q106 366 101 380 Q94 388 88 384 Q84 370 84 342 Q84 312 88 294 Z" },
  { id:"quad_l",      label:"대퇴사두L",
    d:"M50 272 Q38 298 36 340 Q36 376 46 396 Q60 406 76 402 Q90 394 94 372 Q96 336 94 300 Q88 270 72 266 Z" },
  { id:"quad_r",      label:"대퇴사두R",
    d:"M150 272 Q162 298 164 340 Q164 376 154 396 Q140 406 124 402 Q110 394 106 372 Q104 336 106 300 Q112 270 128 266 Z" },
  { id:"tib_l",       label:"전경골근L",
    d:"M44 400 Q35 426 35 454 Q38 470 50 474 Q63 472 70 456 Q74 436 72 406 Q64 396 52 396 Z" },
  { id:"tib_r",       label:"전경골근R",
    d:"M156 400 Q165 426 165 454 Q162 470 150 474 Q137 472 130 456 Q126 436 128 406 Q136 396 148 396 Z" },
];

// ── 후면 근육 클릭 영역 (200x520 기준) ──────────
const BACK_MUSCLES = [
  { id:"utrap_l",     label:"상부승모근L",
    d:"M96 56 Q78 64 68 78 Q68 92 80 98 Q96 94 106 82 Q110 68 102 56 Z" },
  { id:"utrap_r",     label:"상부승모근R",
    d:"M104 56 Q122 64 132 78 Q132 92 120 98 Q104 94 94 82 Q90 68 98 56 Z" },
  { id:"mid_trap",    label:"중하부승모근",
    d:"M80 98 Q64 116 65 142 Q76 156 100 160 Q124 156 135 142 Q136 116 120 98 Q108 90 100 90 Q92 90 80 98 Z" },
  { id:"post_delt_l", label:"후면삼각근L",
    d:"M38 78 Q24 90 22 112 Q24 128 38 134 Q52 130 58 112 Q60 92 50 78 Z" },
  { id:"post_delt_r", label:"후면삼각근R",
    d:"M162 78 Q176 90 178 112 Q176 128 162 134 Q148 130 142 112 Q140 92 150 78 Z" },
  { id:"triceps_l",   label:"삼두근L",
    d:"M20 132 Q10 154 10 178 Q14 196 26 202 Q38 200 44 182 Q48 160 44 134 Q36 124 26 126 Z" },
  { id:"triceps_r",   label:"삼두근R",
    d:"M180 132 Q190 154 190 178 Q186 196 174 202 Q162 200 156 182 Q152 160 156 134 Q164 124 174 126 Z" },
  { id:"forearm_e_l", label:"전완신전L",
    d:"M8 204 Q2 226 4 252 Q8 268 20 272 Q32 270 38 252 Q42 228 40 206 Q32 196 18 198 Z" },
  { id:"forearm_e_r", label:"전완신전R",
    d:"M192 204 Q198 226 196 252 Q192 268 180 272 Q168 270 162 252 Q158 228 160 206 Q168 196 182 198 Z" },
  { id:"lat_l",       label:"광배근L",
    d:"M38 134 Q24 158 22 194 Q24 224 38 240 Q58 250 78 240 Q92 228 94 204 Q96 168 90 142 Q76 126 56 128 Z" },
  { id:"lat_r",       label:"광배근R",
    d:"M162 134 Q176 158 178 194 Q176 224 162 240 Q142 250 122 240 Q108 228 106 204 Q104 168 110 142 Q124 126 144 128 Z" },
  { id:"erect_l",     label:"척추기립근L",
    d:"M78 158 Q72 180 72 216 Q74 244 80 260 Q88 270 96 266 Q100 250 100 224 Q100 190 96 162 Z" },
  { id:"erect_r",     label:"척추기립근R",
    d:"M122 158 Q128 180 128 216 Q126 244 120 260 Q112 270 104 266 Q100 250 100 224 Q100 190 104 162 Z" },
  { id:"glute_l",     label:"둔근L",
    d:"M40 258 Q26 282 24 312 Q26 340 42 352 Q62 360 84 348 Q98 332 98 304 Q96 274 80 258 Z" },
  { id:"glute_r",     label:"둔근R",
    d:"M160 258 Q174 282 176 312 Q174 340 158 352 Q138 360 116 348 Q102 332 102 304 Q104 274 120 258 Z" },
  { id:"ham_l",       label:"햄스트링L",
    d:"M26 352 Q14 378 12 414 Q14 444 28 458 Q46 466 64 456 Q78 444 82 416 Q86 380 80 354 Q66 342 46 346 Z" },
  { id:"ham_r",       label:"햄스트링R",
    d:"M174 352 Q186 378 188 414 Q186 444 172 458 Q154 466 136 456 Q122 444 118 416 Q114 380 120 354 Q134 342 154 346 Z" },
  { id:"gastro_l",    label:"비복근L",
    d:"M16 460 Q6 484 8 506 Q12 516 26 518 Q42 516 50 502 Q56 484 54 462 Q46 452 30 454 Z" },
  { id:"gastro_r",    label:"비복근R",
    d:"M184 460 Q194 484 192 506 Q188 516 174 518 Q158 516 150 502 Q144 484 146 462 Q154 452 170 454 Z" },
];

// ── 인체 실루엣 & 근육 윤곽선 (의료 차트 스타일) ────
// 흰 배경 + 얇은 회색 선 (#6b7280, 0.8px)
function BodyChart({ view }) {
  const S = "#6b7280";  // 선 색상
  const F = "#f5f5f5";  // 근육 기본 채우기 (아주 연한 회색)
  const W = 0.7;        // 선 두께
  const isFront = view === "front";

  return (
    <g stroke={S} strokeWidth={W} strokeLinejoin="round" fill="none">
      {/* ── 공통: 머리, 목 ── */}
      <ellipse cx="100" cy="26" rx="18" ry="22" fill={F} />
      <line x1="95" y1="47" x2="95" y2="58" />
      <line x1="105" y1="47" x2="105" y2="58" />

      {/* ── 전면 ── */}
      {isFront && <>
        {/* 쇄골 */}
        <path d="M95 58 Q76 60 58 72" />
        <path d="M105 58 Q124 60 142 72" />
        {/* 흉곽 외곽 */}
        <path d="M58 72 Q42 82 38 100 L36 138 Q40 154 52 164 L68 172 Q84 176 100 176 Q116 176 132 172 L148 164 Q160 154 164 138 L162 100 Q158 82 142 72" fill={F}/>
        {/* 대흉근 경계 */}
        <path d="M95 80 Q76 84 62 96 Q58 112 62 128 Q72 140 94 142" />
        <path d="M105 80 Q124 84 138 96 Q142 112 138 128 Q128 140 106 142" />
        {/* 흉골 중앙선 */}
        <line x1="100" y1="60" x2="100" y2="176" strokeDasharray="2,2" strokeWidth="0.5"/>
        {/* 전거근 */}
        <path d="M36 130 Q30 148 32 170 L48 168 Q46 148 46 134" />
        <path d="M164 130 Q170 148 168 170 L152 168 Q154 148 154 134" />
        {/* 복직근 세로선 */}
        <rect x="88" y="176" width="24" height="72" rx="4" fill={F} />
        <line x1="100" y1="176" x2="100" y2="248" strokeDasharray="2,2" strokeWidth="0.5"/>
        <line x1="88" y1="198" x2="112" y2="198" strokeWidth="0.5"/>
        <line x1="88" y1="218" x2="112" y2="218" strokeWidth="0.5"/>
        <line x1="88" y1="236" x2="112" y2="236" strokeWidth="0.5"/>
        {/* 외복사근 */}
        <path d="M52 164 Q46 186 46 212 L52 234 L86 248" />
        <path d="M148 164 Q154 186 154 212 L148 234 L114 248" />
        {/* 골반/서혜부 */}
        <path d="M52 248 Q54 260 66 266 L100 270 L134 266 Q146 260 148 248" fill={F}/>
        <path d="M86 250 Q80 262 78 278" />
        <path d="M114 250 Q120 262 122 278" />
        {/* 팔 외곽 */}
        <path d="M36 100 Q22 120 18 148 Q16 172 20 196 Q26 216 36 228" fill={F}/>
        <path d="M164 100 Q178 120 182 148 Q184 172 180 196 Q174 216 164 228" fill={F}/>
        {/* 전완 */}
        <path d="M18 198 Q10 220 10 248 Q14 268 26 274 Q40 272 46 252 Q50 228 46 200" fill={F}/>
        <path d="M182 198 Q190 220 190 248 Q186 268 174 274 Q160 272 154 252 Q150 228 154 200" fill={F}/>
        {/* 손 */}
        <ellipse cx="16" cy="284" rx="10" ry="12" fill={F}/>
        <ellipse cx="184" cy="284" rx="10" ry="12" fill={F}/>
        {/* 대퇴부 */}
        <path d="M66 270 Q50 298 46 340 Q44 378 54 404 L76 414 Q94 418 100 416" fill={F}/>
        <path d="M134 270 Q150 298 154 340 Q156 378 146 404 L124 414 Q106 418 100 416" fill={F}/>
        {/* 슬개골 */}
        <ellipse cx="60" cy="413" rx="12" ry="8" fill="#e9eaf0"/>
        <ellipse cx="140" cy="413" rx="12" ry="8" fill="#e9eaf0"/>
        {/* 하퇴부/정강이 */}
        <path d="M50 420 Q40 448 40 476 Q44 492 56 496 Q70 494 76 478 Q80 456 78 424" fill={F}/>
        <path d="M150 420 Q160 448 160 476 Q156 492 144 496 Q130 494 124 478 Q120 456 122 424" fill={F}/>
        {/* 발 */}
        <path d="M40 494 Q34 502 34 510 L78 510 Q82 502 78 494" fill={F}/>
        <path d="M160 494 Q166 502 166 510 L122 510 Q118 502 122 494" fill={F}/>
      </>}

      {/* ── 후면 ── */}
      {!isFront && <>
        {/* 승모근 상부 */}
        <path d="M95 58 Q76 62 60 74 Q46 84 42 100 L60 102 Q70 90 84 86 L95 82" fill={F}/>
        <path d="M105 58 Q124 62 140 74 Q154 84 158 100 L140 102 Q130 90 116 86 L105 82" fill={F}/>
        {/* 등 외곽 */}
        <path d="M42 100 L36 140 Q34 170 38 200 L44 240 L60 262 L100 268 L140 262 L156 240 L162 200 Q166 170 164 140 L158 100" fill={F}/>
        {/* 척추선 */}
        <line x1="100" y1="60" x2="100" y2="270" strokeDasharray="2,2" strokeWidth="0.5"/>
        {/* 견갑골 L */}
        <path d="M58 90 Q52 110 56 134 Q66 144 80 138 Q90 128 86 108 Q82 90 70 84" />
        <path d="M58 90 Q74 94 86 108" />
        {/* 견갑골 R */}
        <path d="M142 90 Q148 110 144 134 Q134 144 120 138 Q110 128 114 108 Q118 90 130 84" />
        <path d="M142 90 Q126 94 114 108" />
        {/* 광배근 경계 */}
        <path d="M36 140 Q28 164 28 194 Q32 222 46 238 Q64 248 82 240" />
        <path d="M164 140 Q172 164 172 194 Q168 222 154 238 Q136 248 118 240" />
        {/* 능형근 */}
        <path d="M60 100 Q60 124 68 136 L100 142 L132 136 Q140 124 140 100" strokeWidth="0.5"/>
        {/* 팔 외곽 후면 */}
        <path d="M36 102 Q22 124 18 154 Q16 178 20 202 Q26 220 36 232" fill={F}/>
        <path d="M164 102 Q178 124 182 154 Q184 178 180 202 Q174 220 164 232" fill={F}/>
        {/* 삼두근 경계 */}
        <path d="M22 134 Q18 158 20 178 Q24 194 34 196" />
        <path d="M178 134 Q182 158 180 178 Q176 194 166 196" />
        {/* 전완 후면 */}
        <path d="M18 202 Q10 224 10 252 Q14 270 26 276 Q40 274 46 254 Q50 230 46 204" fill={F}/>
        <path d="M182 202 Q190 224 190 252 Q186 270 174 276 Q160 274 154 254 Q150 230 154 204" fill={F}/>
        {/* 손 */}
        <ellipse cx="16" cy="286" rx="10" ry="12" fill={F}/>
        <ellipse cx="184" cy="286" rx="10" ry="12" fill={F}/>
        {/* 요추/골반 */}
        <path d="M44 244 Q40 262 42 282 L58 296 L100 302 L142 296 L158 282 Q160 262 156 244" fill={F}/>
        {/* 둔근 */}
        <path d="M42 280 Q28 306 26 334 Q30 358 50 368 Q74 374 100 368 Q126 374 150 368 Q170 358 174 334 Q172 306 158 280" fill={F}/>
        <line x1="100" y1="280" x2="100" y2="374" strokeDasharray="2,2" strokeWidth="0.5"/>
        {/* 대퇴 후면 */}
        <path d="M30 370 Q18 398 16 436 Q18 466 32 480 Q50 488 68 480 Q82 468 86 440 Q90 406 84 372" fill={F}/>
        <path d="M170 370 Q182 398 184 436 Q182 466 168 480 Q150 488 132 480 Q118 468 114 440 Q110 406 116 372" fill={F}/>
        {/* 종아리 */}
        <path d="M20 482 Q12 504 14 520 L60 520 Q66 506 64 482" fill={F}/>
        <path d="M180 482 Q188 504 186 520 L140 520 Q134 506 136 482" fill={F}/>
      </>}
    </g>
  );
}

// ── 의료 바디차트 메인 컴포넌트 ─────────────────
function MuscleBodySVG({ muscles, bodyMap, onClickMuscle, view, mode }) {
  const tightList = muscles.filter(m => bodyMap[m.id] === "tight").map(m => m.label);
  const weakList  = muscles.filter(m => bodyMap[m.id] === "weak").map(m => m.label);

  return (
    <div style={{width:"100%", maxWidth:280, margin:"0 auto"}}>
      {/* 모드 안내 */}
      <div style={{
        textAlign:"center", marginBottom:8,
        padding:"5px 10px", borderRadius:6,
        background: mode==="tight" ? "#fef2f2" : "#eff6ff",
        border: "1px solid " + (mode==="tight" ? "#fecaca" : "#bfdbfe"),
        fontSize:11, color: mode==="tight" ? "#dc2626" : "#2563eb", fontWeight:700
      }}>
        {mode==="tight" ? "🔴 타이트 모드 — 근육을 터치하세요" : "🔵 기능저하 모드 — 근육을 터치하세요"}
      </div>

      {/* 바디차트 */}
      <div style={{
        background:"#ffffff", borderRadius:10,
        border:"1.5px solid #d1d5db",
        boxShadow:"0 1px 6px rgba(0,0,0,.08)",
        overflow:"hidden"
      }}>
        <svg viewBox="0 0 200 520" style={{width:"100%", display:"block"}}
          xmlns="http://www.w3.org/2000/svg">
          {/* 흰 배경 */}
          <rect x="0" y="0" width="200" height="520" fill="white"/>
          {/* 의료 차트 스타일 인체 도면 */}
          <BodyChart view={view} />
          {/* 투명 클릭 영역 — 선택 시만 색상 */}
          {muscles.map(m => {
            const status = bodyMap[m.id];
            const cfg    = status ? BODY_STATUS[status] : null;
            return (
              <path
                key={m.id}
                d={m.d}
                fill={status ? cfg.fill : "transparent"}
                stroke={status ? cfg.color : "transparent"}
                strokeWidth={status ? 1.5 : 0}
                style={{cursor:"pointer", transition:"fill .12s"}}
                onClick={() => onClickMuscle(m.id)}
              />
            );
          })}
        </svg>
        {/* 뷰 레이블 */}
        <div style={{
          textAlign:"center", padding:"5px 0",
          background:"#f9fafb", borderTop:"1px solid #e5e7eb",
          fontSize:9, color:"#9ca3af",
          fontFamily:"monospace", letterSpacing:".12em", fontWeight:600
        }}>
          {view === "front" ? "ANTERIOR  VIEW" : "POSTERIOR  VIEW"}
        </div>
      </div>

      {/* 선택 결과 목록 */}
      {(tightList.length > 0 || weakList.length > 0) && (
        <div style={{
          marginTop:8, padding:"8px 12px",
          background:"#f9fafb", borderRadius:8,
          border:"1px solid #e5e7eb", lineHeight:1.8
        }}>
          {tightList.length > 0 && (
            <div style={{fontSize:11}}>
              <span style={{color:"#dc2626",fontWeight:700}}>🔴 과긴장: </span>
              <span style={{color:"#374151"}}>{tightList.join("  ·  ")}</span>
            </div>
          )}
          {weakList.length > 0 && (
            <div style={{fontSize:11}}>
              <span style={{color:"#2563eb",fontWeight:700}}>🔵 기능저하: </span>
              <span style={{color:"#374151"}}>{weakList.join("  ·  ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const POSTURE_ITEMS = [
  {key:"head",     label:"두부",    opts:["전방","후방","측만"]},
  {key:"shoulder", label:"어깨",    opts:["전방","라운드숄더","비대칭"]},
  {key:"spine",    label:"척추",    opts:["전만","후만","측만"]},
  {key:"pelvis",   label:"골반",    opts:["전방경사","후방경사","좌우 틀어짐"]},
  {key:"knee",     label:"무릎",    opts:["내반","외반","과신전"]},
  {key:"ankle",    label:"발목/발", opts:["회내","회외","편평족","요족"]},
];
const MOBILITY_ITEMS = [
  {key:"sh_flex",      label:"어깨 굴곡",        opts:["정상","제한"]},
  {key:"sh_abd",       label:"어깨 외전",        opts:["정상","제한"]},
  {key:"sh_ir",        label:"어깨 내회전",      opts:["정상","제한"]},
  {key:"hip_flex",     label:"고관절 굴곡",      opts:["정상","제한"]},
  {key:"hip_abd",      label:"고관절 외전",      opts:["정상","제한"]},
  {key:"hip_ir",       label:"고관절 내회전",    opts:["정상","제한"]},
  {key:"slr",          label:"햄스트링 SLR",     opts:["정상","제한 있음"]},
  {key:"df",           label:"발목 Dorsiflexion", opts:["정상","제한 있음"]},
  {key:"core",         label:"코어 안정성",      opts:["약함","보통","강함"]},
  {key:"glute_fn",     label:"둔근 기능",        opts:["약함","보통","강함"]},
  {key:"balance",      label:"한발 서기",        opts:["양호","좌측 불안정","우측 불안정"]},
  {key:"elbow_l_pain", label:"팔꿈치L 통증",     opts:["없음","내측","외측","전반적"]},
  {key:"elbow_r_pain", label:"팔꿈치R 통증",     opts:["없음","내측","외측","전반적"]},
  {key:"elbow_pron",   label:"팔꿈치 회내/회외", opts:["정상","제한"]},
  {key:"elbow_click",  label:"팔꿈치 클릭감",    opts:["없음","있음"]},
  {key:"wrist_l_flex", label:"손목L 굴곡",       opts:["정상","제한"]},
  {key:"wrist_r_flex", label:"손목R 굴곡",       opts:["정상","제한"]},
  {key:"wrist_l_ext",  label:"손목L 신전",       opts:["정상","제한"]},
  {key:"wrist_r_ext",  label:"손목R 신전",       opts:["정상","제한"]},
  {key:"wrist_pain",   label:"손목 통증",         opts:["없음","좌측","우측","양측"]},
  {key:"push_discomf", label:"푸쉬 동작 불편",   opts:["없음","있음"]},
];
const VAS_TIMING = ["아침","운동 중","오래 앉을 때","특정 동작 시","기타"];

function getMuscleLabel(id) {
  return [...FRONT_MUSCLES, ...BACK_MUSCLES].find(m => m.id === id)?.label || id;
}

function generateAutoSummary(bodyMap, posture, mobility) {
  const tightList = Object.entries(bodyMap).filter(([,v])=>v==="tight").map(([k])=>getMuscleLabel(k));
  const weakList  = Object.entries(bodyMap).filter(([,v])=>v==="weak").map(([k])=>getMuscleLabel(k));
  const issues = [];
  if (tightList.length) issues.push("과긴장/타이트: "+tightList.join(", "));
  if (weakList.length)  issues.push("기능저하/약화: "+weakList.join(", "));
  const postureIssues = POSTURE_ITEMS.flatMap(item=>(posture[item.key]||[]).map(v=>item.label+" "+v));
  if (postureIssues.length) issues.push(...postureIssues);
  const mobIssues = MOBILITY_ITEMS
    .filter(item=>{const v=mobility[item.key];return v&&(v==="제한"||v==="제한 있음"||v==="약함"||v==="있음");})
    .map(item=>item.label);
  if (mobIssues.length) issues.push("기능 제한: "+mobIssues.join(", "));
  if (!issues.length) return "";
  const recs = [];
  if (tightList.some(l=>l.includes("흉근")||l.includes("전면삼각"))) recs.push("흉근 이완 + 후면 어깨 활성화");
  if (weakList.some(l=>l.includes("둔근"))) recs.push("둔근 활성화 운동");
  if (weakList.some(l=>l.includes("척추기립근")||l.includes("승모근"))) recs.push("코어 안정화 + 중부 승모근 강화");
  if (mobility["df"]==="제한 있음") recs.push("발목 가동성 개선");
  if (mobility["hip_flex"]==="제한") recs.push("고관절 가동성 개선");
  return issues.join(". ")+"."+(recs.length?" 권장 루틴: "+recs.join(" → "):"");
}

// ════════════════════════════════════════════
// ASSESSMENT SCREEN
// ════════════════════════════════════════════
function AssessmentScreen({ member, onBack, showToast }) {
  const today = new Date().toISOString().split("T")[0];
  const [tab,       setTab]      = useState("바디맵");
  const [records,   setRecords]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("assess_"+member.id)||"[]"); } catch { return []; }
  });
  const [saving,    setSaving]   = useState(false);
  const [viewRec,   setViewRec]  = useState(null);
  const [aiResult,  setAiResult] = useState("");
  const [aiLoading, setAiLoading]= useState(false);

  const [assDate,   setAssDate]  = useState(today);
  const [bodyMap,   setBodyMap]  = useState({});  // {muscleId: "tight"|"weak"}
  const [bodyView,  setBodyView] = useState("front");
  const [mode,      setMode]     = useState("tight"); // "tight" | "weak"
  const [vasScore,  setVasScore] = useState(0);
  const [vasTiming, setVasTiming]= useState([]);
  const [vasMemo,   setVasMemo]  = useState("");
  const [posture,   setPosture]  = useState({});
  const [mobility,  setMobility] = useState({});

  const summary      = generateAutoSummary(bodyMap, posture, mobility);
  const currentMuscles = bodyView==="front" ? FRONT_MUSCLES : BACK_MUSCLES;
  const tightCount   = Object.values(bodyMap).filter(v=>v==="tight").length;
  const weakCount    = Object.values(bodyMap).filter(v=>v==="weak").length;

  function handleClickMuscle(id) {
    setBodyMap(prev => {
      const cur = prev[id];
      if (cur === mode) { const n={...prev}; delete n[id]; return n; } // 토글 해제
      return {...prev, [id]: mode};
    });
  }

  function togglePosture(key, opt) {
    setPosture(prev => {
      const cur=prev[key]||[];
      return {...prev,[key]:cur.includes(opt)?cur.filter(x=>x!==opt):[...cur,opt]};
    });
  }
  function setMobilityVal(key, val) {
    setMobility(prev => ({...prev,[key]:prev[key]===val?null:val}));
  }
  function toggleVasTiming(t) {
    setVasTiming(prev => prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]);
  }

  async function handleSave() {
    setSaving(true);
    const rec = {id:"a"+Date.now(),date:assDate,vasScore,vasTiming,vasMemo,
      bodyMap:{...bodyMap},posture:{...posture},mobility:{...mobility},summary};
    const next = [...records.filter(r=>r.date!==assDate),rec].sort((a,b)=>b.date.localeCompare(a.date));
    setRecords(next);
    try { localStorage.setItem("assess_"+member.id,JSON.stringify(next)); showToast("평가 기록 저장 완료 ✓"); }
    catch(e) { showToast("저장 실패","err"); }
    setSaving(false);
  }

  async function generateAIRoutine() {
    if (!summary && Object.keys(bodyMap).length === 0) {
      showToast("먼저 바디맵 또는 평가를 기록해주세요","err"); return;
    }
    setAiLoading(true); setAiResult("");
    const tightMuscles = Object.entries(bodyMap).filter(([,v])=>v==="tight")
      .map(([k])=>getMuscleLabel(k));
    const weakMuscles  = Object.entries(bodyMap).filter(([,v])=>v==="weak")
      .map(([k])=>getMuscleLabel(k));
    const prompt = `당신은 전문 퍼스널 트레이너입니다. 아래 회원 평가 데이터를 바탕으로 교정 중심 운동 루틴을 작성해주세요.

회원명: ${member.name}
과긴장/타이트 부위: ${tightMuscles.join(", ")||"없음"}
약화/기능저하 부위: ${weakMuscles.join(", ")||"없음"}
VAS 통증 점수: ${vasScore}/10
기타 평가: ${summary||"없음"}

다음 흐름으로 루틴을 구성해주세요:
1. 교정/이완 단계 (타이트 부위 위주)
2. 활성화 단계 (기능저하 부위 위주)
3. 기능 강화 단계
4. 주의사항

각 단계별로 구체적인 운동 이름과 세트/횟수를 포함해 간결하게 작성해주세요. 한국어로 답변하세요.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:800,
          messages:[{role:"user",content:prompt}]
        })
      });
      const data = await res.json();
      const text = (data.content||[]).map(c=>c.text||"").join("");
      setAiResult(text || "응답을 받지 못했습니다.");
    } catch(e) {
      setAiResult("AI 루틴 생성 중 오류가 발생했습니다: "+e.message);
    }
    setAiLoading(false);
  }

  const TABS = [
    {key:"바디맵", icon:"🗺️"},
    {key:"통증",   icon:"🩺"},
    {key:"자세",   icon:"📐"},
    {key:"기능",   icon:"⚡"},
    {key:"AI루틴", icon:"🤖"},
    {key:"기록",   icon:"📅"},
  ];
  const ac = "#a29bfe";

  // ── 과거 기록 보기 ──
  if (viewRec) {
    const tList = Object.entries(viewRec.bodyMap||{}).filter(([,v])=>v==="tight");
    const wList = Object.entries(viewRec.bodyMap||{}).filter(([,v])=>v==="weak");
    const _allM2 = [...FRONT_MUSCLES, ...BACK_MUSCLES];
    const getLabel = id => _allM2.find(m=>m.id===id)?.label||id;
    return (
      <div>
        <SH title={"📋 "+viewRec.date+" 평가"} sub={member.name}
          right={<Btn ghost sm onClick={()=>setViewRec(null)}>← 뒤로</Btn>}/>
        {viewRec.summary && (
          <Card style={{marginBottom:11,border:"1px solid "+ac+"33",background:ac+"08"}}>
            <Mo c={ac} s={9} style={{display:"block",marginBottom:5}}>📝 평가 요약</Mo>
            <div style={{fontSize:12,color:"#ddddf0",lineHeight:1.8}}>{viewRec.summary}</div>
          </Card>
        )}
        {(tList.length>0||wList.length>0) && (
          <Card title="🗺️ 바디맵 소견" style={{marginBottom:11}}>
            {tList.length>0 && (
              <div style={{marginBottom:8}}>
                <Mo c="#ef4444" s={9} style={{display:"block",marginBottom:5}}>🔴 과긴장/타이트</Mo>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {tList.map(([id])=><span key={id} style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"2px 8px",borderRadius:4,background:"#fee2e2",color:"#dc2626"}}>{getLabel(id)}</span>)}
                </div>
              </div>
            )}
            {wList.length>0 && (
              <div>
                <Mo c="#3b82f6" s={9} style={{display:"block",marginBottom:5}}>🔵 약화/기능저하</Mo>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {wList.map(([id])=><span key={id} style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"2px 8px",borderRadius:4,background:"#dbeafe",color:"#2563eb"}}>{getLabel(id)}</span>)}
                </div>
              </div>
            )}
          </Card>
        )}
        {viewRec.vasScore>0 && (
          <Card title="🩺 통증" style={{marginBottom:11}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:"#ef4444"}}>{viewRec.vasScore}</span>
              <Mo c="#54546a" s={9}>/10 {(viewRec.vasTiming||[]).join(" · ")}</Mo>
            </div>
            {viewRec.vasMemo&&<Mo c="#54546a" s={10} style={{display:"block",marginTop:4}}>{viewRec.vasMemo}</Mo>}
          </Card>
        )}
        {POSTURE_ITEMS.some(item=>(viewRec.posture?.[item.key]||[]).length>0) && (
          <Card title="📐 자세" style={{marginBottom:11}}>
            {POSTURE_ITEMS.map(item=>{const v=viewRec.posture?.[item.key]||[];if(!v.length)return null;return <div key={item.key} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #1a1a24"}}><Mo c="#54546a" s={10}>{item.label}</Mo><Mo c="#ffd166" s={10}>{v.join(", ")}</Mo></div>;})}
          </Card>
        )}
      </div>
    );
  }

  // ── 메인 화면 ──
  return (
    <div>
      <SH title="📋 체형 평가" sub={member.name} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>}/>

      {/* 탭 */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12,overflowX:"auto",paddingBottom:2}}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{padding:"6px 11px",borderRadius:16,border:"1px solid",flexShrink:0,cursor:"pointer",
              borderColor:tab===t.key?ac:"#1a1a24",background:tab===t.key?ac+"22":"transparent",
              color:tab===t.key?ac:"#54546a",fontSize:11,fontWeight:700}}>
            {t.icon} {t.key}
          </button>
        ))}
      </div>

      <Field label="평가 날짜" type="date" value={assDate} onChange={setAssDate}/>
      <div style={{marginBottom:12}}/>

      {/* ─── 바디맵 탭 ─── */}
      {tab==="바디맵" && (
        <div>
          {/* 모드 선택 */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={()=>setMode("tight")}
              style={{flex:1,padding:"10px",borderRadius:8,border:"2px solid",cursor:"pointer",
                borderColor:mode==="tight"?"#dc2626":"#d1d5db",
                background:mode==="tight"?"#fee2e2":"#f9fafb",
                color:mode==="tight"?"#dc2626":"#6b7280",fontWeight:700,fontSize:13}}>
              🔴 타이트 / 과긴장
            </button>
            <button onClick={()=>setMode("weak")}
              style={{flex:1,padding:"10px",borderRadius:8,border:"2px solid",cursor:"pointer",
                borderColor:mode==="weak"?"#2563eb":"#d1d5db",
                background:mode==="weak"?"#dbeafe":"#f9fafb",
                color:mode==="weak"?"#2563eb":"#6b7280",fontWeight:700,fontSize:13}}>
              🔵 약화 / 기능저하
            </button>
          </div>

          <Mo c="#54546a" s={9} style={{display:"block",marginBottom:8,textAlign:"center"}}>
            모드 선택 후 근육 부위를 터치 · 다시 터치하면 해제
          </Mo>

          {/* 전면/후면 전환 */}
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            {["front","back"].map(v=>(
              <button key={v} onClick={()=>setBodyView(v)}
                style={{flex:1,padding:"7px",borderRadius:7,border:"1px solid",cursor:"pointer",
                  borderColor:bodyView===v?ac:"#1a1a24",background:bodyView===v?ac+"22":"transparent",
                  color:bodyView===v?ac:"#54546a",fontSize:11,fontWeight:700}}>
                {v==="front"?"전면 (Anterior)":"후면 (Posterior)"}
              </button>
            ))}
          </div>

          {/* 카운터 */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <div style={{flex:1,padding:"6px 10px",borderRadius:7,background:"#fee2e2",border:"1px solid #fca5a5"}}>
              <Mo c="#dc2626" s={9} style={{fontWeight:700}}>🔴 과긴장 {tightCount}곳</Mo>
            </div>
            <div style={{flex:1,padding:"6px 10px",borderRadius:7,background:"#dbeafe",border:"1px solid #93c5fd"}}>
              <Mo c="#2563eb" s={9} style={{fontWeight:700}}>🔵 기능저하 {weakCount}곳</Mo>
            </div>
          </div>

          {/* 바디맵 */}
          <Card style={{marginBottom:10,background:"#fff",border:"1px solid #e5e7eb",padding:8}}>
            <MuscleBodySVG
              muscles={currentMuscles}
              bodyMap={bodyMap}
              mode={mode}
              onClickMuscle={handleClickMuscle}
              view={bodyView}
            />
          </Card>

          {/* 선택 목록 */}
          {Object.keys(bodyMap).length > 0 && (
            <Card style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <Mo c="#ddddf0" s={10} style={{fontWeight:700}}>선택된 근육</Mo>
                <button onClick={()=>setBodyMap({})}
                  style={{background:"none",border:"1px solid #1a1a24",borderRadius:5,
                    color:"#54546a",fontSize:10,fontWeight:700,padding:"3px 9px",cursor:"pointer"}}>전체 초기화</button>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {Object.entries(bodyMap).map(([id,status])=>{
                  const col   = BODY_STATUS[status]?.color;
                  const label = getMuscleLabel(id);
                  return (
                    <button key={id}
                      onClick={()=>setBodyMap(prev=>{const n={...prev};delete n[id];return n;})}
                      style={{fontFamily:"'DM Mono',monospace",fontSize:9,padding:"3px 8px",borderRadius:4,
                        background:bodyMap[id]==="tight"?"#fee2e2":"#dbeafe",color:bodyMap[id]==="tight"?"#dc2626":"#2563eb",border:"1px solid "+(bodyMap[id]==="tight"?"#fca5a5":"#93c5fd"),cursor:"pointer"}}>
                      {label} ✕
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── 통증 탭 ─── */}
      {tab==="통증" && (
        <Card title="🩺 통증 기록" style={{marginBottom:12}}>
          <div style={{marginBottom:14}}>
            <Mo c="#54546a" s={9} style={{display:"block",marginBottom:6}}>VAS 통증 강도 (0=없음 · 10=극심함)</Mo>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:42,
              color:vasScore===0?"#3a3a4a":vasScore<=3?"#00e5a0":vasScore<=6?"#ffd166":"#ef4444"}}>
              {vasScore}
            </span>
            <input type="range" min={0} max={10} value={vasScore} onChange={e=>setVasScore(parseInt(e.target.value))}
              style={{width:"100%",accentColor:"#ef4444",border:"none",padding:0,background:"transparent"}}/>
            <div style={{display:"flex",justifyContent:"space-between"}}><Mo c="#3a3a4a" s={8}>없음</Mo><Mo c="#ef4444" s={8}>극심함</Mo></div>
          </div>
          <div style={{marginBottom:12}}>
            <Mo c="#54546a" s={9} style={{display:"block",marginBottom:6}}>발생 시점</Mo>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {VAS_TIMING.map(t=>(
                <button key={t} onClick={()=>toggleVasTiming(t)}
                  style={{padding:"5px 12px",borderRadius:16,border:"1px solid",cursor:"pointer",
                    borderColor:vasTiming.includes(t)?"#ff9f43":"#1a1a24",
                    background:vasTiming.includes(t)?"rgba(255,159,67,.15)":"transparent",
                    color:vasTiming.includes(t)?"#ff9f43":"#54546a",fontSize:11,fontWeight:700}}>{t}</button>
              ))}
            </div>
          </div>
          <TextArea label="통증 부위 및 메모" value={vasMemo} onChange={setVasMemo}
            placeholder="예: 우측 무릎 내측, 계단 오를 때 심함"/>
        </Card>
      )}

      {/* ─── 자세 탭 ─── */}
      {tab==="자세" && (
        <Card title="📐 체형 자세 평가" style={{marginBottom:12}}>
          <Mo c="#54546a" s={9} style={{display:"block",marginBottom:12}}>해당 항목 모두 선택 (복수 가능)</Mo>
          {POSTURE_ITEMS.map(item=>(
            <div key={item.key} style={{marginBottom:12}}>
              <Mo c="#ddddf0" s={11} style={{display:"block",marginBottom:5,fontWeight:700}}>{item.label}</Mo>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {item.opts.map(opt=>{const active=(posture[item.key]||[]).includes(opt);return(
                  <button key={opt} onClick={()=>togglePosture(item.key,opt)}
                    style={{padding:"5px 12px",borderRadius:16,border:"1px solid",cursor:"pointer",
                      borderColor:active?"#ffd166":"#1a1a24",background:active?"rgba(255,209,102,.15)":"transparent",
                      color:active?"#ffd166":"#54546a",fontSize:11,fontWeight:700}}>{opt}</button>
                );})}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ─── 기능 탭 ─── */}
      {tab==="기능" && (
        <div>
          <Card title="⚡ 가동성 · 기능 검사" style={{marginBottom:11}}>
            {MOBILITY_ITEMS.filter(item=>!item.key.includes("elbow")&&!item.key.includes("wrist")&&!item.key.includes("push")).map(item=>(
              <div key={item.key} style={{marginBottom:10}}>
                <Mo c="#ddddf0" s={10} style={{display:"block",marginBottom:4,fontWeight:600}}>{item.label}</Mo>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {item.opts.map(opt=>{const active=mobility[item.key]===opt;const col=opt==="제한"||opt==="제한 있음"||opt==="약함"?"#ff9f43":opt==="강함"||opt==="양호"?"#00e5a0":"#ffd166";return(
                    <button key={opt} onClick={()=>setMobilityVal(item.key,opt)}
                      style={{padding:"5px 12px",borderRadius:16,border:"1px solid",cursor:"pointer",
                        borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",
                        color:active?col:"#54546a",fontSize:11,fontWeight:700}}>{opt}</button>
                  );})}
                </div>
              </div>
            ))}
          </Card>

          <Card title="💪 팔꿈치 평가" style={{marginBottom:11}}>
            {MOBILITY_ITEMS.filter(item=>item.key.includes("elbow")).map(item=>(
              <div key={item.key} style={{marginBottom:10}}>
                <Mo c="#ddddf0" s={10} style={{display:"block",marginBottom:4,fontWeight:600}}>{item.label}</Mo>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {item.opts.map(opt=>{const active=mobility[item.key]===opt;const col=opt==="있음"||opt.includes("측")||opt.includes("전반")?"#ff9f43":"#00e5a0";return(
                    <button key={opt} onClick={()=>setMobilityVal(item.key,opt)}
                      style={{padding:"5px 12px",borderRadius:16,border:"1px solid",cursor:"pointer",
                        borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",
                        color:active?col:"#54546a",fontSize:11,fontWeight:700}}>{opt}</button>
                  );})}
                </div>
              </div>
            ))}
          </Card>

          <Card title="🤝 손목 평가" style={{marginBottom:11}}>
            {MOBILITY_ITEMS.filter(item=>item.key.includes("wrist")||item.key.includes("push")).map(item=>(
              <div key={item.key} style={{marginBottom:10}}>
                <Mo c="#ddddf0" s={10} style={{display:"block",marginBottom:4,fontWeight:600}}>{item.label}</Mo>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {item.opts.map(opt=>{const active=mobility[item.key]===opt;const col=opt==="제한"||opt==="있음"||opt.includes("측")?"#ff9f43":"#00e5a0";return(
                    <button key={opt} onClick={()=>setMobilityVal(item.key,opt)}
                      style={{padding:"5px 12px",borderRadius:16,border:"1px solid",cursor:"pointer",
                        borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",
                        color:active?col:"#54546a",fontSize:11,fontWeight:700}}>{opt}</button>
                  );})}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ─── AI 루틴 탭 ─── */}
      {tab==="AI루틴" && (
        <div>
          {summary && (
            <Card style={{marginBottom:11,border:"1px solid "+ac+"44",background:ac+"08"}}>
              <Mo c={ac} s={9} style={{display:"block",marginBottom:5}}>📝 현재 평가 요약</Mo>
              <div style={{fontSize:11,color:"#ddddf0",lineHeight:1.8}}>{summary}</div>
            </Card>
          )}
          <button onClick={generateAIRoutine} disabled={aiLoading}
            style={{width:"100%",padding:"14px",borderRadius:10,border:"none",marginBottom:12,
              background:aiLoading?"#1a1a24":"linear-gradient(135deg,#7c6fff,#a29bfe)",
              color:aiLoading?"#54546a":"#fff",fontFamily:"'Syne',sans-serif",fontWeight:800,
              fontSize:15,cursor:aiLoading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {aiLoading ? "⏳ 루틴 생성 중..." : "🤖 AI 교정 루틴 자동 생성"}
          </button>
          {aiResult && (
            <Card title="🤖 AI 교정 루틴" style={{border:"1px solid #7c6fff44",background:"rgba(124,111,255,.05)"}}>
              <div style={{fontSize:12,color:"#ddddf0",lineHeight:1.9,whiteSpace:"pre-wrap"}}>{aiResult}</div>
            </Card>
          )}
          {!aiResult && !aiLoading && (
            <div style={{textAlign:"center",padding:"32px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <div style={{fontSize:32,marginBottom:8}}>🤖</div>
              <Mo c="#54546a" s={10}>바디맵 및 평가 기록 후 버튼을 누르면</Mo>
              <Mo c="#54546a" s={10} style={{display:"block"}}>교정 → 활성화 → 강화 순서로 루틴이 생성됩니다.</Mo>
            </div>
          )}
        </div>
      )}

      {/* ─── 기록 목록 탭 ─── */}
      {tab==="기록" && (
        <div>
          {records.length===0 ? (
            <div style={{textAlign:"center",padding:"40px",background:"#111116",borderRadius:12,border:"1px dashed #1a1a24"}}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              <Mo c="#2a2a3a" s={10}>저장된 평가 기록이 없습니다.</Mo>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {records.map(r=>{
                const tc=Object.values(r.bodyMap||{}).filter(v=>v==="tight").length;
                const wc=Object.values(r.bodyMap||{}).filter(v=>v==="weak").length;
                return (
                  <div key={r.id} style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:10,padding:"12px 14px",cursor:"pointer"}}
                    onClick={()=>setViewRec(r)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <Mo c="#54546a" s={9}>{r.date}</Mo>
                      <div style={{display:"flex",gap:5}}>
                        {tc>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:4,background:"#fee2e2",color:"#dc2626"}}>🔴 {tc}</span>}
                        {wc>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:4,background:"#dbeafe",color:"#2563eb"}}>🔵 {wc}</span>}
                        {r.vasScore>0&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:4,background:"rgba(255,107,107,.1)",color:"#ff9f43"}}>VAS {r.vasScore}</span>}
                      </div>
                    </div>
                    {r.summary&&<div style={{fontSize:11,color:"#54546a",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{r.summary}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 저장 버튼 */}
      {tab!=="기록" && tab!=="AI루틴" && (
        <div style={{marginTop:8}}>
          {summary && tab==="바디맵" && (
            <Card style={{marginBottom:10,border:"1px solid "+ac+"44",background:ac+"08"}}>
              <Mo c={ac} s={9} style={{display:"block",marginBottom:4}}>📝 자동 평가 요약</Mo>
              <div style={{fontSize:11,color:"#ddddf0",lineHeight:1.8}}>{summary}</div>
            </Card>
          )}
          <Btn full onClick={handleSave} disabled={saving}>{saving?"저장 중...":"평가 기록 저장 →"}</Btn>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════
// 공용 UI 컴포넌트
// ════════════════════════════════════════════
function SH({ title, sub, right }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
      <div>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:"#fff",letterSpacing:"-0.5px"}}>{title}</div>
        {sub && <Mo c="#54546a" s={9} style={{marginTop:2}}>{sub}</Mo>}
      </div>
      {right && <div style={{flexShrink:0,marginLeft:8}}>{right}</div>}
    </div>
  );
}
function Card({ title, children, style }) {
  return (
    <div style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:12,overflow:"hidden",...(style||{})}}>
      {title && <div style={{padding:"8px 13px",borderBottom:"1px solid #1a1a24",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:"#ddddf0"}}>{title}</div>}
      <div style={{padding:12}}>{children}</div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, type }) {
  return <div><label>{label}</label><input type={type||"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>;
}
function TextArea({ label, value, onChange, placeholder }) {
  return <div><label>{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>;
}
function Btn({ children, onClick, sm, full, disabled, ghost, style }) {
  if (ghost) return <button onClick={onClick} style={{padding:sm?"6px 14px":"12px 16px",borderRadius:7,border:"1px solid #1a1a24",background:"transparent",color:"#7070a0",fontSize:sm?11:13,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",...(style||{})}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{padding:sm?"6px 14px":"12px 16px",borderRadius:7,border:"none",background:disabled?"#1a1a24":"#00e5a0",color:disabled?"#54546a":"#09090c",fontSize:sm?11:13,fontWeight:800,width:full?"100%":"auto",opacity:disabled?0.5:1,cursor:"pointer",whiteSpace:"nowrap",...(style||{})}}>{children}</button>;
}
function Mo({ children, c, s, style }) { return <span style={{fontFamily:"'DM Mono',monospace",fontSize:s||11,color:c,...(style||{})}}>{children}</span>; }
function Bdg({ children, color }) { return <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,padding:"1px 5px",borderRadius:10,background:color+"22",color}}>{children}</span>; }
function StatTile({ label, value, sub }) {
  return <div style={{background:"#09090c",border:"1px solid #1a1a24",borderRadius:9,padding:"9px 10px",textAlign:"center"}}><Mo c="#54546a" s={8}>{label}</Mo><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#00e5a0",marginTop:2,marginBottom:sub?1:0}}>{value}</div>{sub&&<Mo c="#3a3a4a" s={8}>{sub}</Mo>}</div>;
}
function Spin({ sm }) { return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:sm?0:40}}><div style={{width:sm?12:24,height:sm?12:24,border:(sm?2:3)+"px solid #21212a",borderTopColor:"#00e5a0",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/></div>; }
function Skel({ n }) { return <div style={{display:"flex",flexDirection:"column",gap:7}}>{Array.from({length:n||3},(_,i)=><div key={i} style={{height:48,background:"#111116",borderRadius:9}}/>)}</div>; }
function Emp({ msg }) { return <div style={{textAlign:"center",padding:"36px 16px",fontFamily:"'DM Mono',monospace",fontSize:10,color:"#2a2a3a"}}>{msg}</div>; }
function PTag({ children, bg, color, border }) { return <span style={{background:bg,color,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:20,fontFamily:"'DM Mono',monospace",border:border||"none"}}>{children}</span>; }
function PLbl({ children }) { return <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#bbb",letterSpacing:".13em",textTransform:"uppercase",marginBottom:6,display:"flex",alignItems:"center",gap:5}}><span style={{display:"inline-block",width:9,height:1,background:"#ddd"}}/>{children}<span style={{flex:1,display:"inline-block",height:1,background:"#eee"}}/></div>; }
function PNote({ title, content, accent }) { return <div style={{background:"#fafafa",border:"1px solid #ebebeb",borderRadius:5,padding:"6px 8px",borderTop:"2px solid "+accent}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:accent,marginBottom:2,letterSpacing:".07em"}}>{title.toUpperCase()}</div><div style={{fontSize:9,color:"#444",lineHeight:1.6}}>{content}</div></div>; }

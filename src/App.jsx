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
} from "./db";

// ─── 운동 분류 상수 ───
const EQUIP_LIST   = ["바벨","덤벨","케이블","머신","맨몸"];
const EQUIP_COLOR  = {바벨:"#7c6fff",덤벨:"#00e5a0",케이블:"#ffd166",머신:"#ff9f43",맨몸:"#ff6b6b"};
const MUSCLE_MAP   = {
  "가슴":      ["윗가슴","가운데가슴","아랫가슴","전체"],
  "등":        ["등상부","광배근"],
  "어깨":      ["전면","측면","후면"],
  "팔-이두근": ["하부","상부","전체"],
  "팔-삼두근": ["장두","단두","내측두","전체"],
  "하체":      ["대퇴사두","햄스트링","둔근","종아리"],
  "복근":      ["복근"],
  "기타":      ["기타"],
};
const MUSCLE_LIST  = Object.keys(MUSCLE_MAP);
const MUSCLE_COLOR = {
  "가슴":"#7c6fff","등":"#00e5a0","어깨":"#ffd166",
  "팔-이두근":"#ff9f43","팔-삼두근":"#ff6b6b",
  "하체":"#54a0ff","복근":"#a29bfe","기타":"#888",
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
function calcVol(w,r) { return (parseFloat(w)||0)*(parseInt(r)||0); }
function exVol(ex) { return (ex.sets||[]).reduce((s,r) => s+(r.volume||0), 0); }

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
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:"#fff",letterSpacing:"-1px"}}>PT JOURNAL</div>
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
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14,color:"#fff"}}>PT JOURNAL</span>
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
        {screen==="session"    && member && <SessionScreen member={member} sessions={sessions} editData={editSess} onSave={handleSaveSession} onBack={() => { setEditSess(null); goHubReload(); }} showToast={showToast} />}
        {screen==="history"    && <HistoryScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} onEdit={s => { setEditSess(s); setScreen("session"); }} onDelete={handleDeleteSession} />}
        {screen==="library"    && <LibraryScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} />}
        {screen==="feedback"   && <FeedbackScreen sessions={sessions} member={member} loading={loading} onBack={() => setScreen("hub")} />}
        {screen==="correction" && <CorrectionScreen sessions={sessions} loading={loading} onBack={() => setScreen("hub")} />}
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
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:27,color:"#fff",letterSpacing:"-1px",marginBottom:5}}>PT JOURNAL</div>
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
                  {m.programType === "교정 프로그램" ? "🧘" : "💪"}
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#fff",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
                  <Mo c="#54546a" s={9}>{m.programType}{m.startDate ? " · "+m.startDate : ""}</Mo>
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
  const isEdit = !!initial;
  const [name,      setName]      = useState(initial?.name      || "");
  const [phone,     setPhone]     = useState(initial?.phone     || "");
  const [prog,      setProg]      = useState(initial?.programType || "일반 PT");
  const [goal,      setGoal]      = useState(initial?.goal      || "");
  const [startDate, setStartDate] = useState(initial?.startDate || new Date().toISOString().split("T")[0]);
  const [memo,      setMemo]      = useState(initial?.memo      || "");

  return (
    <div>
      <SH title={isEdit ? "✏️ 회원 수정" : "➕ 회원 등록"} right={<Btn ghost sm onClick={onBack}>← 뒤로</Btn>} />
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Field label="이름 *" value={name} onChange={setName} placeholder="김회원" />
          <Field label="전화번호" value={phone} onChange={setPhone} placeholder="010-0000-0000" />
        </div>
        <div style={{marginTop:10}}>
          <label>프로그램 유형</label>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {["일반 PT","교정 프로그램"].map(t => (
              <button key={t} onClick={() => setProg(t)}
                style={{flex:1,padding:"9px",borderRadius:7,border:"1px solid",
                  borderColor:prog===t?"#00e5a0":"#1a1a24",
                  background:prog===t?"rgba(0,229,160,.1)":"transparent",
                  color:prog===t?"#00e5a0":"#54546a",fontSize:13,fontWeight:700}}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:9}}>
          <Field label="시작일" type="date" value={startDate} onChange={setStartDate} />
          <TextArea label="목표" value={goal} onChange={setGoal} placeholder="예: 체지방 감량, 어깨 교정" />
          <TextArea label="메모" value={memo} onChange={setMemo} placeholder="부상 이력, 특이사항 등" />
        </div>
        <div style={{marginTop:14}}>
          <Btn full onClick={() => onSave({name,phone,programType:prog,goal,startDate,memo})} disabled={!name}>
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
  const isCorr   = member.programType === "교정 프로그램";
  const totalVol = sessions.reduce((s,ss) => s+(ss.totalVolume||0), 0);
  const last     = sessions.length > 0 ? sessions[sessions.length-1] : null;
  const wData    = sessions.filter(s => s.bodyWeight && parseFloat(s.bodyWeight) > 0)
                           .map(s => ({name:s.sessionNo+"회", w:parseFloat(s.bodyWeight)}));
  const menus = [
    {icon:"✏️",label:"수업 기록",    desc:"오늘 수업 입력",           sc:"session",    c:"#00e5a0"},
    {icon:"📅",label:"히스토리",     desc:"전체 수업 · 수정 · 삭제",  sc:"history",    c:"#7c6fff"},
    {icon:"📚",label:"운동 라이브러리",desc:"부위별 운동 기록",         sc:"library",    c:"#00bfff"},
    {icon:"📊",label:"블록 피드백",  desc:"부위/기구별 볼륨 분석",    sc:"feedback",   c:"#ffd166"},
  ];
  if (isCorr) menus.push({icon:"🧘",label:"교정 분석",desc:"가동범위·통증 변화",sc:"correction",c:"#ff9f43"});

  return (
    <div>
      <div style={{background:"#111116",border:"1px solid #1a1a24",borderRadius:12,padding:"14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:44,height:44,borderRadius:11,background:"#1a1a24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
              {isCorr ? "🧘" : "💪"}
            </div>
            <div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:"#fff"}}>{member.name}</div>
              <Mo c="#54546a" s={9}>{member.programType}{member.startDate ? " · "+member.startDate : ""}</Mo>
              {member.goal && <Mo c="#7070a0" s={11} style={{display:"block",marginTop:2}}>{member.goal}</Mo>}
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <Btn ghost sm onClick={() => setScreen("members")}>← 목록</Btn>
            <Btn ghost sm onClick={onEdit} style={{color:"#7c6fff",borderColor:"#7c6fff33"}}>수정</Btn>
          </div>
        </div>
        {member.memo && <div style={{marginTop:9,padding:"7px 10px",background:"#09090c",borderRadius:6,fontSize:11,color:"#54546a",borderLeft:"2px solid #21212a"}}>{member.memo}</div>}
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
function SessionScreen({ member, sessions, editData, onSave, onBack, showToast }) {
  const isCorr = member.programType === "교정 프로그램";
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
      const sets = ex.sets.map((row,j) => {
        if (j !== si) return row;
        const u = {...row, [key]:val};
        if (key==="weight"||key==="reps") u.volume = calcVol(key==="weight"?val:row.weight, key==="reps"?val:row.reps);
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
      <div>
        <SH title="📸 수업 요약 카드" sub="스크린샷 후 회원에게 전송"
          right={<Btn ghost sm onClick={() => setShowCard(false)}>← 닫기</Btn>} />
        <SummaryCard member={member} trainerName={trainerName} gymName={gymName}
          date={date} sessionNo={sessionNo} intensity={intensity} condition={condition}
          exercises={exercises} totalVol={totalVol} trainerComment={trainerComment} bodyWeight={bodyWeight} />
        <div style={{marginTop:12,padding:"10px 14px",background:"#111116",borderRadius:8,
          border:"1px dashed #1a1a24",fontSize:11,color:"#54546a",textAlign:"center",lineHeight:1.7}}>
          📱 위 카드를 <strong style={{color:"#ddddf0"}}>길게 눌러</strong> 스크린샷 저장 후 회원에게 공유하세요.
        </div>
      </div>
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
            <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 65px 18px",gap:4,marginBottom:3}}>
              {["SET","무게kg","횟수","볼륨",""].map((h,i) => <Mo key={i} c="#2a2a3a" s={8} style={{textAlign:"center"}}>{h}</Mo>)}
            </div>
            {ex.sets.map((row, si) => (
              <div key={si} style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 65px 18px",gap:4,marginBottom:3,alignItems:"center"}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"#3a3a4e",background:"#111116",borderRadius:4,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>{si+1}</div>
                <input value={row.weight} onChange={e => updateSet(ei,si,"weight",e.target.value)} placeholder="0" style={{textAlign:"center",height:32,padding:"0 4px",fontSize:14}} />
                <input value={row.reps}   onChange={e => updateSet(ei,si,"reps",  e.target.value)} placeholder="0" style={{textAlign:"center",height:32,padding:"0 4px",fontSize:14}} />
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#00e5a0",textAlign:"center",height:32,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,229,160,.06)",borderRadius:5}}>
                  {row.volume>0 ? row.volume.toLocaleString() : "—"}
                </div>
                {ex.sets.length>1 ? <button onClick={() => removeSet(ei,si)} style={{background:"none",border:"none",color:"#2a2a3a",fontSize:11,padding:0,textAlign:"center"}}>✕</button> : <div />}
              </div>
            ))}
            <button onClick={() => addSet(ei)} style={{width:"100%",marginTop:3,padding:"6px",border:"1px dashed #1a1a24",borderRadius:5,background:"none",color:"#3a3a4e",fontSize:10,fontWeight:700}}>+ 세트 추가</button>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:7}}>
              <Mo c="#00e5a0" s={9}>볼륨 {exVol(ex).toLocaleString()} kg</Mo>
            </div>
            <div style={{marginTop:5}}>
              <input value={ex.feedback} onChange={e => updateEx(ei,"feedback",e.target.value)} placeholder="자세 피드백" style={{fontSize:12,color:"#8080a0"}} />
            </div>
          </div>
        ))}
        <button onClick={addEx} style={{width:"100%",padding:10,border:"1px dashed #1a1a24",borderRadius:8,background:"none",color:"#54546a",fontSize:12,fontWeight:700}}>+ 운동 종목 추가</button>
        <div style={{marginTop:9,padding:"9px 13px",background:"linear-gradient(135deg,#0d2018,#09090c)",border:"1px solid rgba(0,229,160,.2)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Mo c="#54546a" s={9}>TOTAL VOLUME</Mo>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,color:"#00e5a0"}}>{totalVol.toLocaleString()} <span style={{fontSize:10,fontWeight:400,color:"#54546a"}}>kg</span></span>
        </div>
      </Card>

      {isCorr && (
        <Card title="🧘 교정 기록" style={{marginTop:11}}>
          <div style={{marginBottom:13}}>
            <Mo c="#54546a" s={9} style={{marginBottom:7}}>가동범위 (ROM)</Mo>
            {CPARTS.map(p => (
              <div key={p} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
                <Mo c="#6060a0" s={8} style={{width:70,flexShrink:0}}>{p}</Mo>
                <div style={{display:"flex",gap:3,flex:1,flexWrap:"wrap"}}>
                  {ROMLEVELS.map(lv => {
                    const active=romData[p]===lv; const col=lv==="정상"?"#00e5a0":lv==="약간 제한"?"#ffd166":lv==="중등도 제한"?"#ff9f43":"#ff6b6b";
                    return <button key={lv} onClick={() => setRomData({...romData,[p]:lv})} style={{flex:1,minWidth:44,padding:"4px 2px",borderRadius:4,border:"1px solid",borderColor:active?col:"#1a1a24",background:active?col+"22":"transparent",color:active?col:"#3a3a4e",fontSize:9,fontWeight:700}}>{lv}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
          <div>
            <Mo c="#54546a" s={9} style={{marginBottom:7}}>통증 강도 (0=없음 · 10=심함)</Mo>
            {CPARTS.map(p => (
              <div key={p} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                <Mo c="#6060a0" s={8} style={{width:70,flexShrink:0}}>{p}</Mo>
                <input type="range" min={0} max={10} value={painData[p]} onChange={e => setPainData({...painData,[p]:parseInt(e.target.value)})} style={{flex:1,accentColor:"#ff6b6b",background:"transparent",border:"none",padding:0,width:"auto"}} />
                <Mo s={10} c={painData[p]>6?"#ff6b6b":painData[p]>3?"#ffd166":"#00e5a0"} style={{width:14,textAlign:"right"}}>{painData[p]}</Mo>
              </div>
            ))}
          </div>
        </Card>
      )}

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
          <Mo c="#2a2a3a" s={8}>PT JOURNAL</Mo>
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
// 운동 라이브러리 프리셋 (카테고리별 정렬)
// ════════════════════════════════════════════
const EXERCISE_PRESETS = {
  "하체": [
    {
      category: "맨몸 스쿼트 계열",
      exercises: [
        {name:"맨몸 스쿼트",        equipment:"맨몸", muscleSub:"대퇴사두"},
        {name:"점프 스쿼트",         equipment:"맨몸", muscleSub:"대퇴사두"},
        {name:"와이드 스쿼트",       equipment:"맨몸", muscleSub:"대퇴사두"},
        {name:"월 스쿼트",           equipment:"맨몸", muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "바벨·머신 스쿼트 계열",
      exercises: [
        {name:"바벨 백 스쿼트",      equipment:"바벨",  muscleSub:"대퇴사두"},
        {name:"바벨 프론트 스쿼트",  equipment:"바벨",  muscleSub:"대퇴사두"},
        {name:"브이스쿼트",          equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"스미스 머신 스쿼트",  equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"핵 스쿼트",           equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"컨벤셔널 데드리프트", equipment:"바벨",  muscleSub:"대퇴사두"},
        {name:"고블릿 스쿼트",       equipment:"덤벨",  muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "레그프레스 계열",
      exercises: [
        {name:"레그프레스",           equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"45도 레그프레스",      equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"수평 레그프레스",      equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"와이드 레그프레스",    equipment:"머신",  muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "레그 익스텐션",
      exercises: [
        {name:"레그 익스텐션",        equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"싱글 레그 익스텐션",   equipment:"머신",  muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "햄스트링 계열",
      exercises: [
        {name:"레그컬 (라잉)",        equipment:"머신",  muscleSub:"햄스트링"},
        {name:"레그컬 (시티드)",      equipment:"머신",  muscleSub:"햄스트링"},
        {name:"스티프 레그 데드리프트", equipment:"바벨", muscleSub:"햄스트링"},
        {name:"루마니안 데드리프트",  equipment:"바벨",  muscleSub:"햄스트링"},
        {name:"덤벨 루마니안 데드리프트", equipment:"덤벨", muscleSub:"햄스트링"},
        {name:"Nordic 컬",           equipment:"맨몸",  muscleSub:"햄스트링"},
      ]
    },
    {
      category: "둔근 계열",
      exercises: [
        {name:"힙 쓰러스트",          equipment:"바벨",  muscleSub:"둔근"},
        {name:"덤벨 힙 쓰러스트",     equipment:"덤벨",  muscleSub:"둔근"},
        {name:"케이블 킥백",          equipment:"케이블", muscleSub:"둔근"},
        {name:"글루트 킥백 머신",     equipment:"머신",  muscleSub:"둔근"},
        {name:"싱글 레그 힙 쓰러스트", equipment:"맨몸", muscleSub:"둔근"},
        {name:"글루트 브릿지",        equipment:"맨몸",  muscleSub:"둔근"},
        {name:"사이드 라잉 클램",     equipment:"맨몸",  muscleSub:"둔근"},
        {name:"힙 어브덕션 머신",     equipment:"머신",  muscleSub:"둔근"},
      ]
    },
    {
      category: "이너 싸이 (내전근)",
      exercises: [
        {name:"힙 어덕션 머신",       equipment:"머신",  muscleSub:"대퇴사두"},
        {name:"수모 스쿼트",          equipment:"덤벨",  muscleSub:"대퇴사두"},
        {name:"케이블 힙 어덕션",     equipment:"케이블", muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "런지 계열",
      exercises: [
        {name:"런지",                 equipment:"맨몸",  muscleSub:"대퇴사두"},
        {name:"덤벨 런지",            equipment:"덤벨",  muscleSub:"대퇴사두"},
        {name:"바벨 런지",            equipment:"바벨",  muscleSub:"대퇴사두"},
        {name:"불가리안 스플릿 스쿼트", equipment:"덤벨", muscleSub:"대퇴사두"},
        {name:"바벨 불가리안 스플릿 스쿼트", equipment:"바벨", muscleSub:"대퇴사두"},
        {name:"리버스 런지",          equipment:"맨몸",  muscleSub:"대퇴사두"},
        {name:"워킹 런지",            equipment:"덤벨",  muscleSub:"대퇴사두"},
      ]
    },
    {
      category: "종아리 계열",
      exercises: [
        {name:"스탠딩 카프레이즈",    equipment:"맨몸",  muscleSub:"종아리"},
        {name:"머신 카프레이즈",      equipment:"머신",  muscleSub:"종아리"},
        {name:"시티드 카프레이즈",    equipment:"머신",  muscleSub:"종아리"},
        {name:"덤벨 카프레이즈",      equipment:"덤벨",  muscleSub:"종아리"},
        {name:"레그프레스 카프레이즈", equipment:"머신", muscleSub:"종아리"},
      ]
    },
  ],

  "등": [
    {
      category: "풀다운 계열",
      exercises: [
        {name:"랫풀다운",             equipment:"케이블", muscleSub:"광배근"},
        {name:"언더그립 랫풀다운",    equipment:"케이블", muscleSub:"광배근"},
        {name:"풀업",                 equipment:"맨몸",  muscleSub:"광배근"},
        {name:"친업",                 equipment:"맨몸",  muscleSub:"광배근"},
        {name:"어시스티드 풀업",      equipment:"머신",  muscleSub:"광배근"},
        {name:"스트레이트 암 풀다운", equipment:"케이블", muscleSub:"광배근"},
        {name:"풀오버 머신",          equipment:"머신",  muscleSub:"광배근"},
      ]
    },
    {
      category: "케이블 로우 계열",
      exercises: [
        {name:"시티드 케이블 로우",   equipment:"케이블", muscleSub:"등상부"},
        {name:"케이블 로우 (와이드)", equipment:"케이블", muscleSub:"등상부"},
        {name:"케이블 로우 (언더그립)", equipment:"케이블", muscleSub:"광배근"},
        {name:"페이스풀",             equipment:"케이블", muscleSub:"등상부"},
      ]
    },
    {
      category: "바벨 로우 계열",
      exercises: [
        {name:"바벨 로우",            equipment:"바벨",  muscleSub:"등상부"},
        {name:"언더그립 바벨 로우",   equipment:"바벨",  muscleSub:"광배근"},
        {name:"펜들레이 로우",        equipment:"바벨",  muscleSub:"등상부"},
        {name:"T바 로우",             equipment:"바벨",  muscleSub:"등상부"},
      ]
    },
    {
      category: "덤벨 로우 계열",
      exercises: [
        {name:"덤벨 원암 로우",       equipment:"덤벨",  muscleSub:"등상부"},
        {name:"인클라인 덤벨 로우",   equipment:"덤벨",  muscleSub:"등상부"},
        {name:"덤벨 풀오버",          equipment:"덤벨",  muscleSub:"광배근"},
      ]
    },
    {
      category: "루마니안 데드리프트",
      exercises: [
        {name:"루마니안 데드리프트",  equipment:"바벨",  muscleSub:"등상부"},
        {name:"스모 데드리프트",      equipment:"바벨",  muscleSub:"등상부"},
        {name:"컨벤셔널 데드리프트",  equipment:"바벨",  muscleSub:"등상부"},
      ]
    },
  ],

  "가슴": [
    {
      category: "푸쉬업 계열",
      exercises: [
        {name:"푸쉬업",               equipment:"맨몸",  muscleSub:"가운데가슴"},
        {name:"와이드 푸쉬업",        equipment:"맨몸",  muscleSub:"가운데가슴"},
        {name:"인클라인 푸쉬업",      equipment:"맨몸",  muscleSub:"윗가슴"},
        {name:"디클라인 푸쉬업",      equipment:"맨몸",  muscleSub:"아랫가슴"},
      ]
    },
    {
      category: "가운데 가슴 — 프레스",
      exercises: [
        {name:"바벨 벤치프레스",       equipment:"바벨",  muscleSub:"가운데가슴"},
        {name:"덤벨 벤치프레스",       equipment:"덤벨",  muscleSub:"가운데가슴"},
        {name:"체스트 프레스 머신",    equipment:"머신",  muscleSub:"가운데가슴"},
        {name:"스미스 머신 벤치프레스", equipment:"머신",  muscleSub:"가운데가슴"},
      ]
    },
    {
      category: "가운데 가슴 — 플라이",
      exercises: [
        {name:"펙덱 플라이",           equipment:"머신",  muscleSub:"가운데가슴"},
        {name:"케이블 크로스 오버",    equipment:"케이블", muscleSub:"가운데가슴"},
        {name:"덤벨 플라이",           equipment:"덤벨",  muscleSub:"가운데가슴"},
      ]
    },
    {
      category: "윗가슴 — 프레스",
      exercises: [
        {name:"인클라인 바벨 벤치프레스",      equipment:"바벨",  muscleSub:"윗가슴"},
        {name:"스미스 머신 인클라인 벤치프레스", equipment:"머신", muscleSub:"윗가슴"},
        {name:"덤벨 인클라인 벤치프레스",      equipment:"덤벨",  muscleSub:"윗가슴"},
        {name:"인클라인 체스트 프레스 머신",   equipment:"머신",  muscleSub:"윗가슴"},
      ]
    },
    {
      category: "윗가슴 — 플라이",
      exercises: [
        {name:"인클라인 덤벨 플라이",    equipment:"덤벨",  muscleSub:"윗가슴"},
        {name:"케이블 인클라인 플라이",  equipment:"케이블", muscleSub:"윗가슴"},
        {name:"어퍼 케이블 크로스오버", equipment:"케이블", muscleSub:"윗가슴"},
      ]
    },
    {
      category: "아랫가슴 계열",
      exercises: [
        {name:"딥스",                   equipment:"맨몸",  muscleSub:"아랫가슴"},
        {name:"딥스 머신",              equipment:"머신",  muscleSub:"아랫가슴"},
        {name:"디클라인 바벨 벤치프레스", equipment:"바벨", muscleSub:"아랫가슴"},
        {name:"로우 케이블 크로스오버", equipment:"케이블", muscleSub:"아랫가슴"},
      ]
    },
  ],

  "어깨": [
    {
      category: "프레스 계열",
      exercises: [
        {name:"바벨 오버헤드 프레스",  equipment:"바벨",  muscleSub:"전면"},
        {name:"덤벨 숄더 프레스",      equipment:"덤벨",  muscleSub:"전면"},
        {name:"스미스 머신 숄더 프레스", equipment:"머신", muscleSub:"전면"},
        {name:"숄더 프레스 머신",      equipment:"머신",  muscleSub:"전면"},
        {name:"아놀드 프레스",         equipment:"덤벨",  muscleSub:"전면"},
        {name:"밀리터리 프레스",       equipment:"바벨",  muscleSub:"전면"},
      ]
    },
    {
      category: "측면 삼각근 — 레이즈",
      exercises: [
        {name:"덤벨 사이드 레이즈",   equipment:"덤벨",  muscleSub:"측면"},
        {name:"케이블 사이드 레이즈", equipment:"케이블", muscleSub:"측면"},
        {name:"머신 사이드 레이즈",   equipment:"머신",  muscleSub:"측면"},
        {name:"업라이트 로우",         equipment:"바벨",  muscleSub:"측면"},
      ]
    },
    {
      category: "전면 삼각근 — 레이즈",
      exercises: [
        {name:"덤벨 프론트 레이즈",   equipment:"덤벨",  muscleSub:"전면"},
        {name:"바벨 프론트 레이즈",   equipment:"바벨",  muscleSub:"전면"},
        {name:"케이블 프론트 레이즈", equipment:"케이블", muscleSub:"전면"},
        {name:"플레이트 프론트 레이즈", equipment:"맨몸", muscleSub:"전면"},
      ]
    },
    {
      category: "후면 삼각근 — 레이즈",
      exercises: [
        {name:"덤벨 리어 레이즈",     equipment:"덤벨",  muscleSub:"후면"},
        {name:"케이블 리어 레이즈",   equipment:"케이블", muscleSub:"후면"},
        {name:"리버스 펙덱 플라이",   equipment:"머신",  muscleSub:"후면"},
        {name:"페이스풀",             equipment:"케이블", muscleSub:"후면"},
        {name:"리버스 플라이 머신",   equipment:"머신",  muscleSub:"후면"},
      ]
    },
  ],

  "팔-이두근": [
    {
      category: "바벨 컬 계열",
      exercises: [
        {name:"바벨 컬",              equipment:"바벨",  muscleSub:"전체"},
        {name:"EZ바 컬",              equipment:"바벨",  muscleSub:"전체"},
        {name:"스탠딩 바벨 컬",       equipment:"바벨",  muscleSub:"하부"},
        {name:"프리처 컬 (바벨)",     equipment:"바벨",  muscleSub:"하부"},
      ]
    },
    {
      category: "덤벨 컬 계열",
      exercises: [
        {name:"덤벨 컬",              equipment:"덤벨",  muscleSub:"전체"},
        {name:"얼터네이트 덤벨 컬",   equipment:"덤벨",  muscleSub:"전체"},
        {name:"인클라인 덤벨 컬",     equipment:"덤벨",  muscleSub:"상부"},
        {name:"컨센트레이션 컬",      equipment:"덤벨",  muscleSub:"상부"},
        {name:"프리처 컬 (덤벨)",     equipment:"덤벨",  muscleSub:"하부"},
      ]
    },
    {
      category: "케이블 컬 계열",
      exercises: [
        {name:"케이블 컬",            equipment:"케이블", muscleSub:"전체"},
        {name:"하이 케이블 컬",       equipment:"케이블", muscleSub:"상부"},
        {name:"케이블 프리처 컬",     equipment:"케이블", muscleSub:"하부"},
      ]
    },
    {
      category: "해머·리버스 컬 (상완근·요골근)",
      exercises: [
        {name:"해머 컬",              equipment:"덤벨",  muscleSub:"상부"},
        {name:"크로스 바디 해머 컬",  equipment:"덤벨",  muscleSub:"상부"},
        {name:"리버스 컬",            equipment:"바벨",  muscleSub:"상부"},
        {name:"케이블 해머 컬",       equipment:"케이블", muscleSub:"상부"},
      ]
    },
  ],

  "팔-삼두근": [
    {
      category: "외측두 운동",
      exercises: [
        {name:"케이블 푸시다운 (스트레이트바)", equipment:"케이블", muscleSub:"단두"},
        {name:"케이블 푸시다운 (V바)",          equipment:"케이블", muscleSub:"단두"},
        {name:"리버스 그립 푸시다운",           equipment:"케이블", muscleSub:"단두"},
        {name:"원암 케이블 푸시다운",           equipment:"케이블", muscleSub:"단두"},
      ]
    },
    {
      category: "내측두 운동",
      exercises: [
        {name:"클로즈 그립 벤치프레스",         equipment:"바벨",  muscleSub:"내측두"},
        {name:"다이아몬드 푸쉬업",              equipment:"맨몸",  muscleSub:"내측두"},
        {name:"벤치 딥스",                      equipment:"맨몸",  muscleSub:"내측두"},
      ]
    },
    {
      category: "장두 운동",
      exercises: [
        {name:"오버헤드 트라이셉스 익스텐션 (바벨)", equipment:"바벨",  muscleSub:"장두"},
        {name:"오버헤드 트라이셉스 익스텐션 (덤벨)", equipment:"덤벨",  muscleSub:"장두"},
        {name:"케이블 오버헤드 익스텐션",       equipment:"케이블", muscleSub:"장두"},
        {name:"시티드 덤벨 오버헤드 익스텐션",  equipment:"덤벨",  muscleSub:"장두"},
      ]
    },
    {
      category: "전체 삼두 운동",
      exercises: [
        {name:"스컬 크러셔",                     equipment:"바벨",  muscleSub:"전체"},
        {name:"EZ바 스컬 크러셔",                equipment:"바벨",  muscleSub:"전체"},
        {name:"덤벨 킥백",                       equipment:"덤벨",  muscleSub:"전체"},
        {name:"딥스",                            equipment:"맨몸",  muscleSub:"전체"},
        {name:"트라이셉스 머신 푸시다운",        equipment:"머신",  muscleSub:"전체"},
      ]
    },
  ],
};

// ════════════════════════════════════════════
// LIBRARY
// ════════════════════════════════════════════
// 카테고리 정렬 순서 정의 (기록한 운동을 이 순서로 그룹핑)
const CATEGORY_ORDER = {
  "하체": [
    {label:"맨몸 스쿼트 계열",   names:["맨몸 스쿼트","점프 스쿼트","와이드 스쿼트","월 스쿼트"]},
    {label:"바벨·머신 스쿼트 계열", names:["바벨 백 스쿼트","바벨 프론트 스쿼트","브이스쿼트","스미스 머신 스쿼트","핵 스쿼트","컨벤셔널 데드리프트","고블릿 스쿼트"]},
    {label:"레그프레스 계열",     names:["레그프레스","45도 레그프레스","수평 레그프레스","와이드 레그프레스"]},
    {label:"레그 익스텐션",       names:["레그 익스텐션","싱글 레그 익스텐션"]},
    {label:"햄스트링 계열",       names:["레그컬 (라잉)","레그컬 (시티드)","스티프 레그 데드리프트","루마니안 데드리프트","덤벨 루마니안 데드리프트","Nordic 컬"]},
    {label:"둔근 계열",           names:["힙 쓰러스트","덤벨 힙 쓰러스트","케이블 킥백","글루트 킥백 머신","싱글 레그 힙 쓰러스트","글루트 브릿지","사이드 라잉 클램","힙 어브덕션 머신"]},
    {label:"이너 싸이 (내전근)",  names:["힙 어덕션 머신","수모 스쿼트","케이블 힙 어덕션"]},
    {label:"런지 계열",           names:["런지","덤벨 런지","바벨 런지","불가리안 스플릿 스쿼트","바벨 불가리안 스플릿 스쿼트","리버스 런지","워킹 런지"]},
    {label:"종아리 계열",         names:["스탠딩 카프레이즈","머신 카프레이즈","시티드 카프레이즈","덤벨 카프레이즈","레그프레스 카프레이즈"]},
  ],
  "등": [
    {label:"풀다운 계열",         names:["랫풀다운","언더그립 랫풀다운","풀업","친업","어시스티드 풀업","스트레이트 암 풀다운","풀오버 머신"]},
    {label:"케이블 로우 계열",    names:["시티드 케이블 로우","케이블 로우 (와이드)","케이블 로우 (언더그립)","페이스풀"]},
    {label:"바벨 로우 계열",      names:["바벨 로우","언더그립 바벨 로우","펜들레이 로우","T바 로우"]},
    {label:"덤벨 로우 계열",      names:["덤벨 원암 로우","인클라인 덤벨 로우","덤벨 풀오버"]},
    {label:"데드리프트 계열",     names:["루마니안 데드리프트","스모 데드리프트","컨벤셔널 데드리프트"]},
  ],
  "가슴": [
    {label:"푸쉬업 계열",         names:["푸쉬업","와이드 푸쉬업","인클라인 푸쉬업","디클라인 푸쉬업"]},
    {label:"가운데 가슴 — 프레스", names:["바벨 벤치프레스","덤벨 벤치프레스","체스트 프레스 머신","스미스 머신 벤치프레스"]},
    {label:"가운데 가슴 — 플라이", names:["펙덱 플라이","케이블 크로스 오버","덤벨 플라이"]},
    {label:"윗가슴 — 프레스",     names:["인클라인 바벨 벤치프레스","스미스 머신 인클라인 벤치프레스","덤벨 인클라인 벤치프레스","인클라인 체스트 프레스 머신"]},
    {label:"윗가슴 — 플라이",     names:["인클라인 덤벨 플라이","케이블 인클라인 플라이","어퍼 케이블 크로스오버"]},
    {label:"아랫가슴 계열",       names:["딥스","딥스 머신","디클라인 바벨 벤치프레스","로우 케이블 크로스오버"]},
  ],
  "어깨": [
    {label:"프레스 계열",         names:["바벨 오버헤드 프레스","덤벨 숄더 프레스","스미스 머신 숄더 프레스","숄더 프레스 머신","아놀드 프레스","밀리터리 프레스"]},
    {label:"측면 삼각근 — 레이즈", names:["덤벨 사이드 레이즈","케이블 사이드 레이즈","머신 사이드 레이즈","업라이트 로우"]},
    {label:"전면 삼각근 — 레이즈", names:["덤벨 프론트 레이즈","바벨 프론트 레이즈","케이블 프론트 레이즈","플레이트 프론트 레이즈"]},
    {label:"후면 삼각근 — 레이즈", names:["덤벨 리어 레이즈","케이블 리어 레이즈","리버스 펙덱 플라이","페이스풀","리버스 플라이 머신"]},
  ],
  "팔-이두근": [
    {label:"바벨 컬 계열",        names:["바벨 컬","EZ바 컬","스탠딩 바벨 컬","프리처 컬 (바벨)"]},
    {label:"덤벨 컬 계열",        names:["덤벨 컬","얼터네이트 덤벨 컬","인클라인 덤벨 컬","컨센트레이션 컬","프리처 컬 (덤벨)"]},
    {label:"케이블 컬 계열",      names:["케이블 컬","하이 케이블 컬","케이블 프리처 컬"]},
    {label:"해머·리버스 컬",      names:["해머 컬","크로스 바디 해머 컬","리버스 컬","케이블 해머 컬"]},
  ],
  "팔-삼두근": [
    {label:"외측두 운동",         names:["케이블 푸시다운 (스트레이트바)","케이블 푸시다운 (V바)","리버스 그립 푸시다운","원암 케이블 푸시다운"]},
    {label:"내측두 운동",         names:["클로즈 그립 벤치프레스","다이아몬드 푸쉬업","벤치 딥스"]},
    {label:"장두 운동",           names:["오버헤드 트라이셉스 익스텐션 (바벨)","오버헤드 트라이셉스 익스텐션 (덤벨)","케이블 오버헤드 익스텐션","시티드 덤벨 오버헤드 익스텐션"]},
    {label:"전체 삼두 운동",      names:["스컬 크러셔","EZ바 스컬 크러셔","덤벨 킥백","딥스","트라이셉스 머신 푸시다운"]},
  ],
};

function LibraryScreen({ sessions, loading, onBack }) {
  const TABS = ["하체","등","가슴","어깨","팔-이두근","팔-삼두근","복근","기타"];
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
      const items = cat.names
        .filter(name => recordMap[name] && recordMap[name].muscleTop === selTop)
        .map(name => recordMap[name]);
      items.forEach(e => placed.add(e.name));
      if (items.length > 0) groups.push({label:cat.label, items});
    });
    // 카테고리 목록에 없는 기록된 운동 → 맨 아래 기타로
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
      <div style={{background:"#09090c",padding:"7px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#333"}}>PT JOURNAL</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#00e5a0"}}>{trainerName}{gymName?" · "+gymName:""}</span></div>
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

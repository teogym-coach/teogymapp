export function getRuntimeAppMode() {
  if (typeof window === "undefined") return "admin";
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname || "/";
  const explicitMember = path.startsWith("/member") || params.get("app") === "member";
  const explicitAdmin = path.startsWith("/admin") || params.get("app") === "admin";
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;

  try {
    if (explicitMember) localStorage.setItem("teogymAppMode", "member");
    if (explicitAdmin) localStorage.setItem("teogymAppMode", "admin");
    if (!explicitMember && !explicitAdmin && isStandalone && localStorage.getItem("teogymAppMode") === "member") return "member";
  } catch {
    // localStorage can be unavailable in private browsing; URL mode still works.
  }

  return explicitMember ? "member" : "admin";
}

export function isMemberMode() {
  return getRuntimeAppMode() === "member";
}

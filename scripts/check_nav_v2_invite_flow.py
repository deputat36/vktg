from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
errors: list[str] = []

edge_path = root / "supabase/functions/nav-invite-user/index.ts"
access_path = root / "assets/js/nav-v2/nav-temp-password-v2.js"
accept_path = root / "assets/js/nav-v2/nav-accept-invite-v2.js"
loader_path = root / "assets/js/nav-v2/admin-loader-v2.js"

for path in (edge_path, access_path, accept_path, loader_path):
    if not path.exists():
        errors.append(f"Missing invite-flow file: {path.relative_to(root)}")

if not errors:
    edge = edge_path.read_text(encoding="utf-8")
    access = access_path.read_text(encoding="utf-8")
    accept = accept_path.read_text(encoding="utf-8")
    loader = loader_path.read_text(encoding="utf-8")

    edge_markers = [
        'const ACTIONS = new Set(["access_link", "invite_email", "dry_run"])',
        'if (!ACTIONS.has(action))',
        'if (role === "spn" && !managerId)',
        'if (!["owner", "admin"].includes(profile.role))',
        'if (!["owner", "admin", "manager"].includes(data.role))',
        'type: "recovery"',
        'redirectTo: REDIRECT',
    ]
    for marker in edge_markers:
        if marker not in edge:
            errors.append(f"nav-invite-user missing marker: {marker}")

    access_markers = [
        "action: 'access_link'",
        "if (payload.role === 'spn' && !payload.manager_id)",
        "Для СПН обязательно выберите менеджера.",
        "manager.required = required",
        "makeSafeAccessLink",
    ]
    for marker in access_markers:
        if marker not in access:
            errors.append(f"nav-temp-password-v2.js missing marker: {marker}")

    accept_markers = [
        "token_hash",
        "access_token",
        "/auth/v1/verify",
        "/auth/v1/user",
        "method: 'PUT'",
        "dashboard-v2.html",
    ]
    for marker in accept_markers:
        if marker not in accept:
            errors.append(f"nav-accept-invite-v2.js missing marker: {marker}")

    if "SUPABASE_SERVICE_ROLE_KEY" in access or "SUPABASE_SERVICE_ROLE_KEY" in accept:
        errors.append("Browser invite modules must not reference service role key")

    if "nav-temp-password-v2.js?v=20260710-1510" not in loader:
        errors.append("admin-loader-v2.js missing invite module cache-bust")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print("Navigator v2 invite flow static checks passed")

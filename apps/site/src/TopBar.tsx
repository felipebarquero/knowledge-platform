import { useEffect, useRef, useState } from "react";
import { Icon, kernelScopes } from "@knowledge/components";
import type { KernelScopeInfo } from "@knowledge/components";
import { initials, useAuth } from "./auth";

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  kind: "homework" | "study" | "info";
}

type Panel = "kernels" | "notifications" | "settings" | "account" | null;

/**
 * Reader top bar (fixed, top-right). Houses the shared-kernel browser, course
 * notifications, settings and the account/avatar menu. One panel open at a time;
 * outside-click / Escape closes.
 */
export function TopBar({ notifications }: { notifications: AppNotification[] }) {
  const { user, signOut, photo, setPhoto } = useAuth();
  const [open, setOpen] = useState<Panel>(null);
  const [scopes, setScopes] = useState<KernelScopeInfo[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  // Snapshot the live kernels whenever the Kernels panel opens.
  useEffect(() => {
    if (open === "kernels") setScopes(kernelScopes());
  }, [open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));
  const unread = notifications.length;

  return (
    <div className="topbar" ref={ref}>
      <div className="topbar__item">
        <button
          type="button"
          className={`topbar__btn topbar__btn--wide${open === "kernels" ? " is-open" : ""}`}
          onClick={() => toggle("kernels")}
        >
          <Icon icon="lucide:share-2" size={15} /> Kernels <Icon icon="lucide:chevron-down" size={13} />
        </button>
        {open === "kernels" && <KernelsPanel scopes={scopes} />}
      </div>

      <div className="topbar__item">
        <button
          type="button"
          className={`topbar__btn topbar__btn--icon${open === "notifications" ? " is-open" : ""}`}
          aria-label="Notifications"
          onClick={() => toggle("notifications")}
        >
          <Icon icon="lucide:bell" size={17} />
          {unread > 0 && <span className="topbar__badge">{unread}</span>}
        </button>
        {open === "notifications" && <NotificationsPanel items={notifications} />}
      </div>

      <div className="topbar__item">
        <button
          type="button"
          className={`topbar__btn topbar__btn--icon${open === "settings" ? " is-open" : ""}`}
          aria-label="Settings"
          onClick={() => toggle("settings")}
        >
          <Icon icon="lucide:settings" size={17} />
        </button>
        {open === "settings" && <SettingsPanel photo={photo} setPhoto={setPhoto} />}
      </div>

      <div className="topbar__item">
        <button type="button" className="topbar__avatar" aria-label="Account" onClick={() => toggle("account")}>
          {photo ? <img src={photo} alt="" /> : <span>{initials(user?.name ?? "User")}</span>}
        </button>
        {open === "account" && (
          <AccountPanel user={user} onSignOut={signOut} onSettings={() => setOpen("settings")} />
        )}
      </div>
    </div>
  );
}

function Runtime({ icon, label, status, on }: { icon: string; label: string; status: string; on: boolean }) {
  return (
    <div className="topbar__runtime">
      <span className="topbar__runtime-ic">
        <Icon icon={icon} size={15} />
      </span>
      <span className="topbar__runtime-label">{label}</span>
      <span className={`topbar__dot${on ? " on" : ""}`} />
      <span className="topbar__runtime-status">{status}</span>
    </div>
  );
}

function KernelsPanel({ scopes }: { scopes: KernelScopeInfo[] }) {
  const rActive = scopes.some((s) => s.rStarted);
  return (
    <div className="topbar__panel topbar__panel--kernels">
      <div className="topbar__panel-head">
        <Icon icon="lucide:share-2" size={14} /> Shared kernels
      </div>
      <div className="topbar__runtimes">
        <Runtime icon="lucide:terminal" label="R · WebR" status={rActive ? "active" : "idle"} on={rActive} />
        <Runtime icon="lucide:database" label="DuckDB · WASM" status="in-browser" on />
        <Runtime icon="lucide:server" label="SQL · gateway" status=":8787" on />
      </div>
      <div className="topbar__panel-sub">Active pages</div>
      {scopes.length === 0 && <div className="topbar__empty">No kernel started yet — run a cell.</div>}
      {scopes.map((s) => (
        <div key={s.scope} className="topbar__kernel">
          <div className="topbar__kernel-name">
            <span className={`topbar__dot${s.rStarted ? " on" : ""}`} /> {s.scope}
          </div>
          <div className="topbar__kernel-meta">
            {s.tables.length} shared {s.tables.length === 1 ? "table" : "tables"}
            {s.tables.length ? ` · ${s.tables.join(", ")}` : ""}
          </div>
        </div>
      ))}
      <div className="topbar__panel-foot">One kernel per page (scope) · SQL ↔ R share data frames</div>
    </div>
  );
}

function NotificationsPanel({ items }: { items: AppNotification[] }) {
  const iconFor = (k: AppNotification["kind"]) =>
    k === "homework" ? "lucide:book-open-check" : k === "study" ? "lucide:graduation-cap" : "lucide:info";
  return (
    <div className="topbar__panel topbar__panel--notif">
      <div className="topbar__panel-head">
        <Icon icon="lucide:bell" size={14} /> Notifications
      </div>
      {items.length === 0 && <div className="topbar__empty">You’re all caught up.</div>}
      {items.map((n) => (
        <div key={n.id} className={`topbar__notif topbar__notif--${n.kind}`}>
          <span className="topbar__notif-ic">
            <Icon icon={iconFor(n.kind)} size={16} />
          </span>
          <div>
            <div className="topbar__notif-title">{n.title}</div>
            <div className="topbar__notif-detail">{n.detail}</div>
          </div>
        </div>
      ))}
      <a className="topbar__panel-foot topbar__panel-link" href="#course">
        Open course mode →
      </a>
    </div>
  );
}

function SettingsPanel({ photo, setPhoto }: { photo: string | null; setPhoto: (url: string | null) => void }) {
  const [url, setUrl] = useState(photo ?? "");
  return (
    <div className="topbar__panel topbar__panel--settings">
      <div className="topbar__panel-head">
        <Icon icon="lucide:settings" size={14} /> Settings
      </div>
      <label className="topbar__setting">
        <span>Profile photo URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" />
      </label>
      <div className="topbar__setting-actions">
        <button type="button" onClick={() => setPhoto(url.trim() || null)}>
          Save
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setUrl("");
            setPhoto(null);
          }}
        >
          Clear
        </button>
      </div>
      <div className="topbar__panel-sub">Preferences</div>
      <div className="topbar__setting-row">
        <span>Theme</span>
        <span className="topbar__pill">Dark</span>
      </div>
      <div className="topbar__panel-foot">More settings coming soon.</div>
    </div>
  );
}

function AccountPanel({
  user,
  onSignOut,
  onSettings,
}: {
  user: { name: string; email: string } | null;
  onSignOut: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="topbar__panel topbar__panel--account">
      <div className="topbar__account-id">
        <div className="topbar__account-name">{user?.name}</div>
        <div className="topbar__account-mail">{user?.email}</div>
      </div>
      <button type="button" className="topbar__menu-item" onClick={onSettings}>
        <Icon icon="lucide:settings" size={15} /> Settings
      </button>
      <button type="button" className="topbar__menu-item topbar__menu-item--danger" onClick={onSignOut}>
        <Icon icon="lucide:log-out" size={15} /> Sign out
      </button>
    </div>
  );
}

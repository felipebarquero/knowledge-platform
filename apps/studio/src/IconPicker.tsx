import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, loadIconCatalog } from "@knowledge/components";

/**
 * Graphical, searchable icon picker over the offline Iconify collections
 * (lucide + logos, ~3.9k icons). The catalog is lazy-loaded on first open;
 * search is a substring match over the names ("aws", "database", "r-lang").
 * Selecting writes the Iconify name (e.g. "logos:aws-dynamodb") into the IR.
 */
export function IconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && catalog.length === 0) void loadIconCatalog().then(setCatalog);
  }, [open, catalog.length]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? catalog.filter((n) => n.includes(q)) : catalog;
    return pool.slice(0, 120);
  }, [catalog, query]);

  return (
    <div className="ws-iconpicker" ref={rootRef}>
      <button type="button" className="ws-iconpicker__trigger" onClick={() => setOpen((o) => !o)}>
        {value ? <Icon icon={value} size={16} /> : <span className="ws-iconpicker__plus">＋</span>}
        <span className="ws-iconpicker__name">{value ?? "pick icon"}</span>
      </button>
      {value && (
        <button type="button" className="ws-reset" title="Clear icon" onClick={() => onChange(undefined)}>
          ↺
        </button>
      )}
      {open && (
        <div className="ws-iconpicker__pop">
          <input
            autoFocus
            type="text"
            className="ws-iconpicker__search"
            placeholder="search… database, aws, r-lang"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ws-iconpicker__grid">
            {catalog.length === 0 ? (
              <span className="ws-iconpicker__none">loading icons…</span>
            ) : results.length === 0 ? (
              <span className="ws-iconpicker__none">no matches</span>
            ) : (
              results.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`ws-iconpicker__item ${name === value ? "is-active" : ""}`}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Icon icon={name} size={20} />
                </button>
              ))
            )}
          </div>
          <p className="ws-iconpicker__hint">{catalog.length} icons · lucide + logos</p>
        </div>
      )}
    </div>
  );
}

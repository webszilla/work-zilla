import { useEffect, useMemo, useRef, useState } from "react";
import { PHONE_COUNTRIES } from "../lib/phoneCountries.js";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function entryKey(entry) {
  return `${String(entry?.code || "").trim()}__${String(entry?.label || "").trim()}`;
}

export default function PhoneCountryCodePicker({
  value = "+91",
  onChange,
  options = PHONE_COUNTRIES,
  className = "",
  style,
  disabled = false,
  ariaLabel = "Country code",
  menuAlign = "left",
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(248);

  const fallbackByKey = useMemo(() => {
    const map = new Map();
    PHONE_COUNTRIES.forEach((entry) => {
      map.set(entryKey(entry), entry);
    });
    return map;
  }, []);
  const fallbackByCode = useMemo(() => {
    const map = new Map();
    PHONE_COUNTRIES.forEach((entry) => {
      const code = String(entry?.code || "").trim();
      if (code && !map.has(code)) {
        map.set(code, entry);
      }
    });
    return map;
  }, []);

  const preparedOptions = useMemo(
    () =>
      (Array.isArray(options) ? options : []).map((entry) => {
        const label = String(entry?.label || "").trim();
        const code = String(entry?.code || "").trim();
        const key = entryKey(entry);
        const fallback = fallbackByKey.get(key) || fallbackByCode.get(code) || null;
        return {
          ...entry,
          label,
          code,
          flag: String(entry?.flag || fallback?.flag || "🌐"),
          key,
          search: normalize(`${label} ${code}`),
        };
      }),
    [options, fallbackByCode, fallbackByKey]
  );

  useEffect(() => {
    if (!preparedOptions.length) {
      setSelectedKey("");
      return;
    }
    const selectedByKey = preparedOptions.find((entry) => entry.key === selectedKey);
    if (selectedByKey && selectedByKey.code === String(value || "").trim()) {
      return;
    }
    const selectedByValue = preparedOptions.find((entry) => entry.code === String(value || "").trim());
    setSelectedKey((selectedByValue || preparedOptions[0]).key);
  }, [preparedOptions, selectedKey, value]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) return;
      setOpen(false);
    }
    function onEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      return undefined;
    }
    function updateMenuPlacement() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const gap = 8;
      const menuHeight = 296;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap);
      const spaceAbove = Math.max(0, rect.top - gap);
      const shouldOpenUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      setOpenUp(shouldOpenUp);
      const available = shouldOpenUp ? spaceAbove : spaceBelow;
      const nextListHeight = Math.max(140, Math.min(320, Math.floor(available - 52)));
      setMenuMaxHeight(nextListHeight);
    }
    updateMenuPlacement();
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);
    return () => {
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [open]);

  const selectedEntry =
    preparedOptions.find((entry) => entry.key === selectedKey) ||
    preparedOptions.find((entry) => entry.code === String(value || "").trim()) ||
    preparedOptions[0] ||
    { flag: "🌐", code: String(value || "").trim() || "+91", label: "" };

  const normalizedQuery = normalize(query);
  const filteredOptions = normalizedQuery
    ? preparedOptions.filter((entry) => entry.search.includes(normalizedQuery))
    : preparedOptions;

  function selectEntry(entry) {
    setSelectedKey(entry.key);
    setOpen(false);
    setQuery("");
    if (typeof onChange === "function") {
      onChange(entry.code, entry);
    }
  }

  return (
    <div
      className={`wz-country-picker ${open ? "is-open" : ""} ${className}`.trim()}
      ref={rootRef}
      style={style}
    >
      <button
        type="button"
        className="wz-country-picker__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        title={`${selectedEntry.label} ${selectedEntry.code}`.trim()}
      >
        <span className="wz-country-picker__flag" aria-hidden="true">
          {selectedEntry.flag || "🌐"}
        </span>
        <i className="bi bi-caret-down-fill wz-country-picker__caret" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className={`wz-country-picker__menu ${
            openUp ? "wz-country-picker__menu--up" : ""
          } ${
            menuAlign === "right" ? "wz-country-picker__menu--right" : ""
          }`.trim()}
        >
          <div className="wz-country-picker__search-wrap">
            <input
              type="text"
              className="wz-country-picker__search"
              placeholder="Search country or code"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
          <div className="wz-country-picker__list" role="listbox" style={{ maxHeight: `${menuMaxHeight}px` }}>
            {filteredOptions.length ? (
              filteredOptions.map((entry) => (
                <button
                  type="button"
                  key={entry.key}
                  className={`wz-country-picker__option ${
                    entry.key === selectedEntry.key ? "is-active" : ""
                  }`.trim()}
                  onClick={() => selectEntry(entry)}
                >
                  <span className="wz-country-picker__option-flag" aria-hidden="true">
                    {entry.flag}
                  </span>
                  <span className="wz-country-picker__option-label">{entry.label}</span>
                  <span className="wz-country-picker__option-code">{entry.code}</span>
                </button>
              ))
            ) : (
              <div className="wz-country-picker__empty">No matches</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, ReactNode } from "react";

export default function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="mobile-menu-btn"
        onClick={() => setOpen(!open)}
        aria-label="メニュー"
      >
        <span style={open ? { transform: "rotate(45deg) translate(4px, 4px)" } : {}} />
        <span style={open ? { opacity: 0 } : {}} />
        <span style={open ? { transform: "rotate(-45deg) translate(4px, -4px)" } : {}} />
      </button>
      <div
        className={`mobile-nav-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      >
        {children}
      </div>
    </>
  );
}

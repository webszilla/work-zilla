import React from "react";

export type SidebarItem = {
  label: string;
  href: string;
};

type SidebarProps = {
  brand?: string;
  items: SidebarItem[];
};

export default function Sidebar({ brand = "Work Zilla", items }: SidebarProps) {
  return (
    <aside className="wz-sidebar">
      <div className="wz-sidebar__brand">{brand}</div>
      <nav className="wz-sidebar__nav">
        {items.map((item) => (
          <a key={item.href} href={item.href} className="wz-sidebar__link">
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

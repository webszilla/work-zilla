import React from "react";

import Sidebar, { SidebarItem } from "./Sidebar";
import Topbar from "./Topbar";

type LayoutProps = {
  title?: string;
  sidebarItems: SidebarItem[];
  topbarActions?: React.ReactNode;
  children: React.ReactNode;
};

export default function Layout({
  title,
  sidebarItems,
  topbarActions,
  children,
}: LayoutProps) {
  return (
    <div className="wz-layout">
      <Sidebar items={sidebarItems} />
      <main className="wz-main">
        <Topbar title={title} actions={topbarActions} />
        <section className="wz-content">{children}</section>
      </main>
    </div>
  );
}

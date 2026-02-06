import React from "react";

type TopbarProps = {
  title?: string;
  actions?: React.ReactNode;
};

export default function Topbar({ title = "Dashboard", actions }: TopbarProps) {
  return (
    <header className="wz-topbar">
      <div className="wz-topbar__title">{title}</div>
      <div className="wz-topbar__actions">{actions}</div>
    </header>
  );
}

import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Card({ children, className = "" }: CardProps) {
  const classes = ["wz-card", className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}

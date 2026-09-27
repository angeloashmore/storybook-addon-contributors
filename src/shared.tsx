import React, { useState } from "react";

import type { ContributorsData } from "./preset";

export const ADDON_ID = "storybook-addon-contributors";
export const SHOW_PANEL_EVENT = `${ADDON_ID}/show-panel`;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readContributorsData(): ContributorsData | undefined {
  return (globalThis as any).__STORYBOOK_ADDON_CONTRIBUTORS__;
}

export function Avatar({
  name,
  gravatarHash,
  size,
}: {
  name: string;
  gravatarHash: string;
  size: number;
}) {
  const [failedToLoad, setFailedToLoad] = useState(false);
  const style = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    fontWeight: "bold",
    fontSize: size / 3,
    background: "#dbeafe",
    border: "2px solid white",
  };

  if (failedToLoad) return <span style={style}>{initials(name)}</span>;

  return (
    <img
      src={`https://www.gravatar.com/avatar/${gravatarHash}?s=${size * 2}&d=identicon`}
      alt=""
      style={style}
      onError={() => setFailedToLoad(true)}
    />
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function daysSince(isoDate: string): number {
  return (Date.now() - Date.parse(isoDate)) / DAY_MS;
}

export function timeAgo(isoDate: string): string {
  const days = Math.floor(daysSince(isoDate));
  if (days < 1) return "today";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round((days / 365) * 10) / 10} years ago`;
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function monthAndYear(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function changesInLastThreeMonths(monthlyChanges: number[]): number {
  return monthlyChanges.slice(-3).reduce((total, count) => total + count, 0);
}

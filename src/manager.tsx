import React, { useState } from "react";
import { AddonPanel } from "storybook/internal/components";
import { addons, types, useStorybookState } from "storybook/manager-api";
import { styled } from "storybook/theming";

import type { Contributor, ContributorsData } from "./preset";

const DAY_MS = 24 * 60 * 60 * 1000;

addons.register("storybook-addon-contributors", () => {
  addons.add("storybook-addon-contributors/panel", {
    type: types.PANEL,
    title: "Contributors",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => (
      <AddonPanel active={Boolean(active)}>
        <Panel />
      </AddonPanel>
    ),
  });
});

function Panel() {
  const { storyId, index } = useStorybookState();
  const data: ContributorsData | undefined = (window as any).__STORYBOOK_ADDON_CONTRIBUTORS__;
  const story = index?.[storyId] as { importPath: string; title: string } | undefined;
  const contributors = story && data?.components[story.importPath]?.contributors;

  if (!story || !data || !contributors?.length) {
    return <Muted>No git history was found for this component.</Muted>;
  }

  const componentName = story.title.split("/").pop();
  const updated = new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: "medium" });

  return (
    <div style={{ padding: "12px 16px" }}>
      <strong>People who have worked on {componentName}</strong>
      <ul style={{ listStyle: "none", margin: "8px 0", padding: 0 }}>
        {contributors.map((contributor) => (
          <Row key={contributor.gravatarHash}>
            <Avatar contributor={contributor} />
            <div>
              <strong data-testid="contributor-name">{contributor.name}</strong>
              <Muted as="div">
                Worked on this in {contributor.commits}{" "}
                {contributor.commits === 1 ? "change" : "changes"} · last active{" "}
                <time
                  dateTime={contributor.lastActive}
                  title={new Date(contributor.lastActive).toDateString()}
                >
                  {timeAgo(contributor.lastActive)}
                </time>
              </Muted>
            </div>
          </Row>
        ))}
      </ul>
      <Muted>Ordered by recent involvement · Updated {updated}</Muted>
    </div>
  );
}

function Avatar({ contributor }: { contributor: Contributor }) {
  const [failedToLoad, setFailedToLoad] = useState(false);
  const style = { width: 40, height: 40, borderRadius: "50%", flexShrink: 0 };

  if (failedToLoad) {
    return <Initials style={style}>{initials(contributor.name)}</Initials>;
  }

  return (
    <img
      src={`https://www.gravatar.com/avatar/${contributor.gravatarHash}?s=80&d=identicon`}
      alt=""
      style={style}
      onError={() => setFailedToLoad(true)}
    />
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/);
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(isoDate: string): string {
  const days = Math.floor((Date.now() - Date.parse(isoDate)) / DAY_MS);
  if (days < 1) return "today";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round((days / 365) * 10) / 10} years ago`;
}

const Muted = styled.p(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
  margin: 0,
}));

const Row = styled.li(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: `1px solid ${theme.appBorderColor}`,
}));

const Initials = styled.span(({ theme }) => ({
  display: "grid",
  placeItems: "center",
  fontWeight: "bold",
  background: theme.background.hoverable,
}));

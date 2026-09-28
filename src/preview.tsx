import {
  Controls,
  Description,
  Primary,
  Stories,
  Subtitle,
  Title,
  useOf,
} from "@storybook/addon-docs/blocks";
import React from "react";
import { addons } from "storybook/preview-api";

import {
  Avatar,
  changesInLastThreeMonths,
  readContributorsData,
  SHOW_PANEL_EVENT,
  timeAgo,
} from "./shared";

export const parameters = {
  docs: {
    page: () => (
      <>
        <Title />
        <Subtitle />
        <ContributorsBlock />
        <Description />
        <Primary />
        <Controls />
        <Stories />
      </>
    ),
  },
};

function ContributorsBlock() {
  const { story } = useOf("story", ["story"]);
  const component = readContributorsData()?.[story.parameters.fileName];
  const contributors = component?.contributors.slice(0, 3);
  if (!component || !contributors?.length) return null;

  const [latestChange] = component.recentChanges;
  const recentCount = changesInLastThreeMonths(component.monthlyChanges);

  return (
    <div data-testid="contributors-docs-block" style={blockStyle}>
      <div style={{ display: "flex" }}>
        {contributors.map((contributor, position) => (
          <span key={contributor.gravatarHash} style={{ marginLeft: position === 0 ? 0 : -8 }}>
            <Avatar name={contributor.name} gravatarHash={contributor.gravatarHash} size={32} />
          </span>
        ))}
      </div>
      <div>
        <strong>{workedOnSentence(contributors.map((contributor) => contributor.name))}</strong>
        <div style={{ color: "#73808c", fontSize: 12, marginTop: 2 }}>
          Most recently {latestChange.author}, {timeAgo(latestChange.date)} · Changed {recentCount}{" "}
          {recentCount === 1 ? "time" : "times"} in the last 3 months
        </div>
      </div>
      <button
        type="button"
        style={linkStyle}
        onClick={() => addons.getChannel().emit(SHOW_PANEL_EVENT, story.id)}
      >
        See people and recent changes →
      </button>
    </div>
  );
}

function workedOnSentence(names: string[]): string {
  if (names.length === 1) return `${names[0]} has worked on this`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)} have worked on this`;
}

const blockStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  margin: "16px 0 24px",
  padding: "12px 16px",
  border: "1px solid #e3e8ee",
  borderRadius: 10,
  background: "#fbfcfe",
  fontSize: 14,
};

const linkStyle = {
  marginLeft: "auto",
  border: 0,
  background: "none",
  color: "#029cfd",
  fontWeight: "bold",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

import React from "react";
import { AddonPanel, TooltipNote, TooltipProvider } from "storybook/internal/components";
import { addons, types, useStorybookState, type API } from "storybook/manager-api";
import { styled } from "storybook/theming";

import type { Contributor } from "./preset";
import {
  ADDON_ID,
  Avatar,
  changesInLastThreeMonths,
  daysSince,
  formatDate,
  monthAndYear,
  readContributorsData,
  SHOW_PANEL_EVENT,
  timeAgo,
} from "./shared";

const PANEL_ID = `${ADDON_ID}/panel`;
const RECENTLY_CHANGED_DAYS = 7;
const LANE_DAYS = 730;
const LANE_WIDTH = 200;

const data = readContributorsData();

addons.register(ADDON_ID, (api) => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Contributors",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => (
      <AddonPanel active={Boolean(active)}>
        <Panel />
      </AddonPanel>
    ),
  });

  addons.setConfig({ sidebar: { renderLabel: sidebarLabel } });

  addons.getChannel().on(SHOW_PANEL_EVENT, (storyId: string) => {
    api.selectStory(storyId);
    api.setSelectedPanel(PANEL_ID);
    api.togglePanel(true);
  });
});

function sidebarLabel(item: any, api: API) {
  if (item.type !== "component") return undefined;
  const firstEntry = api.getData(item.children[0]) as { importPath?: string } | undefined;
  const [latestChange] =
    (firstEntry?.importPath && data?.[firstEntry.importPath]?.recentChanges) || [];
  if (!latestChange || daysSince(latestChange.date) > RECENTLY_CHANGED_DAYS) return undefined;

  const note = `Changed ${timeAgo(latestChange.date)}`;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {item.name}
      <TooltipProvider tooltip={<TooltipNote note={note} maxWidth={280} />} placement="right">
        <ChangedDot aria-label={note} data-testid="changed-dot" />
      </TooltipProvider>
    </span>
  );
}

function Panel() {
  const { storyId, index } = useStorybookState();
  const story = index?.[storyId] as { importPath: string; title: string } | undefined;
  const component = story && data?.[story.importPath];

  if (!story || !data || !component?.contributors.length) {
    return <Muted>No git history was found for this component.</Muted>;
  }

  const componentName = story.title.split("/").pop();

  return (
    <Wrapper>
      <Header>
        <div>
          <strong>People who have worked on {componentName}</strong>
          <Muted>Ordered by recent involvement</Muted>
        </div>
        <Activity monthlyChanges={component.monthlyChanges} />
      </Header>

      <Columns>
        <div>
          <SectionTitle>People</SectionTitle>
          {component.contributors.map((contributor) => (
            <Person key={contributor.gravatarHash} contributor={contributor} />
          ))}
          <LaneScale>
            <span>2 years ago</span>
            <span>1 year</span>
            <span>now</span>
          </LaneScale>
        </div>
        <div>
          <SectionTitle>Recent changes</SectionTitle>
          {component.recentChanges.map((change) => (
            <Row key={change.date} data-testid="recent-change">
              <strong>{change.message}</strong>{" "}
              {change.url && (
                <Link href={change.url} target="_blank" rel="noreferrer">
                  {change.pullRequest ? `#${change.pullRequest}` : "commit"}
                </Link>
              )}
              <Muted>
                {change.author} · {timeAgo(change.date)}
              </Muted>
            </Row>
          ))}
        </div>
      </Columns>
    </Wrapper>
  );
}

function Activity({ monthlyChanges }: { monthlyChanges: number[] }) {
  const recentCount = changesInLastThreeMonths(monthlyChanges);
  const busiestMonth = Math.max(1, ...monthlyChanges);
  const barWidth = 150 / monthlyChanges.length;

  return (
    <ActivityBox>
      <svg width="150" height="28" aria-hidden>
        {monthlyChanges.map((count, month) => {
          const height = count === 0 ? 2 : 6 + (count / busiestMonth) * 22;
          return (
            <rect
              key={month}
              x={month * barWidth + 1}
              y={28 - height}
              width={barWidth - 3}
              height={height}
              rx={1.5}
              fill={count === 0 ? "#d5dde5" : "#029cfd"}
            />
          );
        })}
      </svg>
      <Muted>
        Changed {recentCount} {recentCount === 1 ? "time" : "times"} in the last 3 months
      </Muted>
    </ActivityBox>
  );
}

function Person({ contributor }: { contributor: Contributor }) {
  return (
    <PersonRow data-testid="contributor">
      <Avatar name={contributor.name} gravatarHash={contributor.gravatarHash} size={36} />
      <div>
        <strong data-testid="contributor-name">{contributor.name}</strong>
        <Muted>
          {contributor.commits} {contributor.commits === 1 ? "change" : "changes"} · active{" "}
          <time dateTime={contributor.lastActive}>{timeAgo(contributor.lastActive)}</time>
        </Muted>
        {contributor.inactiveSince && (
          <InactiveTag data-testid="inactive">
            Not active in this repo since {monthAndYear(contributor.inactiveSince)}
          </InactiveTag>
        )}
      </div>
      <Lane changes={contributor.changes} />
    </PersonRow>
  );
}

function Lane({ changes }: { changes: Contributor["changes"] }) {
  return (
    <LaneTrack role="list" aria-label="Changes over the last 2 years">
      {changes.map((change) => {
        const link = change.pullRequest ? `#${change.pullRequest}` : "commit";
        const note = `${change.message} · ${formatDate(change.date)} · ${link}`;
        return (
          <TooltipProvider
            key={change.date}
            tooltip={<TooltipNote note={note} maxWidth={320} />}
            placement="top"
          >
            <Tick
              role="listitem"
              aria-label={note}
              data-testid="lane-change"
              href={change.url}
              target="_blank"
              rel="noreferrer"
              style={{
                left: `calc(${laneProgress(change.date)}% - ${laneProgress(change.date) * 0.03}px)`,
              }}
            />
          </TooltipProvider>
        );
      })}
    </LaneTrack>
  );
}

function laneProgress(date: string): number {
  return (1 - daysSince(date) / LANE_DAYS) * 100;
}

const NARROW = "@container (max-width: 720px)";
const VERY_NARROW = "@container (max-width: 480px)";

const Wrapper = styled.div(({ theme }) => ({
  containerType: "inline-size",
  padding: "12px 16px",
  fontSize: theme.typography.size.s2,
  color: theme.color.defaultText,
}));

const Header = styled.div({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 12,
  [NARROW]: { gap: 8, marginBottom: 20 },
});

const ActivityBox = styled.div({
  marginLeft: "auto",
  textAlign: "right",
  [NARROW]: { marginLeft: 0, textAlign: "left" },
});

const Columns = styled.div({
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 24,
  [NARROW]: { gridTemplateColumns: "1fr" },
});

const SectionTitle = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  fontWeight: theme.typography.weight.bold,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: theme.textMutedColor,
  marginBottom: 4,
}));

const Row = styled.div(({ theme }) => ({
  padding: "8px 0",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  [NARROW]: { padding: "6px 0", borderBottom: "none" },
}));

const PersonRow = styled(Row)({
  display: "grid",
  gridTemplateColumns: `36px 1fr ${LANE_WIDTH}px`,
  alignItems: "center",
  gap: 12,
  [VERY_NARROW]: {
    gridTemplateColumns: "36px 1fr",
    alignItems: "start",
    rowGap: 2,
    "& > :last-child": { gridColumn: 2 },
  },
});

const LaneScale = styled.div(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  width: LANE_WIDTH,
  marginLeft: "auto",
  paddingTop: 4,
  [VERY_NARROW]: { width: "auto", marginLeft: 48 },
  fontSize: 10,
  color: theme.textMutedColor,
}));

const Muted = styled.div(({ theme }) => ({
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1,
}));

const InactiveTag = styled.span({
  display: "inline-block",
  marginTop: 3,
  padding: "1px 7px",
  borderRadius: 10,
  fontSize: 11,
  color: "#9a6700",
  background: "#fff4d6",
});

const Link = styled.a(({ theme }) => ({
  color: theme.color.secondary,
  textDecoration: "none",
  fontWeight: "bold",
}));

const LaneTrack = styled.div({
  position: "relative",
  width: "100%",
  height: 24,
  background: "linear-gradient(#e3e8ee, #e3e8ee) 0 11px / 100% 2px no-repeat",
});

const Tick = styled.a({
  position: "absolute",
  top: 5,
  width: 3,
  height: 14,
  borderRadius: 1.5,
  background: "#029cfd",
  "&:hover, &:focus-visible": { background: "#0070c0", top: 1, height: 22 },
});

const ChangedDot = styled.span({
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "#f0506e",
  flexShrink: 0,
});

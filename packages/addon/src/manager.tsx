import React, { useState } from 'react';
import { AddonPanel } from 'storybook/internal/components';
import { addons, types, useStorybookApi, useStorybookState } from 'storybook/manager-api';
import { styled } from 'storybook/theming';

import { ADDON_ID, DATA_GLOBAL, PANEL_ID } from './constants';
import type { Contributor, ContributorsData } from './types';

declare global {
  interface Window {
    [DATA_GLOBAL]?: ContributorsData;
  }
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Contributors',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <ContributorsPanel />
      </AddonPanel>
    ),
  });
});

function ContributorsPanel() {
  const api = useStorybookApi();
  // Subscribing to state re-renders the panel when the story changes.
  const { storyId } = useStorybookState();
  const story = storyId ? api.getCurrentStoryData() : undefined;
  const data = window[DATA_GLOBAL];

  if (!data) return <Message>Contributor data is not available in this Storybook.</Message>;
  if (!story || !('importPath' in story)) return <Message>Select a story to see who has worked on it.</Message>;

  const component = data.components[story.importPath];
  if (!component || component.contributors.length === 0) {
    return <Message>No git history was found for this component.</Message>;
  }

  return (
    <Wrapper>
      <Heading>People who have worked on {component.title.split('/').pop()}</Heading>
      <List data-testid="contributors-list">
        {component.contributors.map((person) => (
          <Person key={person.gravatarHash} person={person} />
        ))}
      </List>
      <Note>
        From git history as of {formatDate(data.generatedAt)}. Most relevant first: recent work counts more
        (a change's weight halves every {describeDays(data.halfLifeDays)}).
      </Note>
    </Wrapper>
  );
}

function Person({ person }: { person: Contributor }) {
  return (
    <Row data-testid="contributor">
      <Avatar name={person.name} hash={person.gravatarHash} />
      <div>
        <Name data-testid="contributor-name">{person.name}</Name>
        <Meta>
          Worked on this in {person.commits} {person.commits === 1 ? 'commit' : 'commits'} · last active{' '}
          <time dateTime={person.lastActive} title={formatDate(person.lastActive)}>
            {timeAgo(person.lastActive)}
          </time>
        </Meta>
      </div>
    </Row>
  );
}

function Avatar({ name, hash }: { name: string; hash: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Initials aria-hidden>{initials(name)}</Initials>;
  return (
    <AvatarImg
      src={`https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`}
      alt=""
      width={40}
      height={40}
      onError={() => setFailed(true)}
    />
  );
}

// --- helpers ---------------------------------------------------------------

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

function describeDays(days: number) {
  const months = Math.round(days / 30.4);
  return months >= 1 ? `${months} ${months === 1 ? 'month' : 'months'}` : `${days} days`;
}

// --- styles ----------------------------------------------------------------

const Wrapper = styled.div(({ theme }) => ({
  padding: '12px 16px',
  fontSize: theme.typography.size.s2,
  color: theme.color.defaultText,
}));

const Heading = styled.h2(({ theme }) => ({
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
  margin: '0 0 8px',
}));

const List = styled.ul({ listStyle: 'none', margin: 0, padding: 0 });

const Row = styled.li(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 0',
  borderBottom: `1px solid ${theme.appBorderColor}`,
}));

const AvatarImg = styled.img({ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 });

const Initials = styled.span(({ theme }) => ({
  width: 40,
  height: 40,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: theme.typography.weight.bold,
  background: theme.background.hoverable,
}));

const Name = styled.div(({ theme }) => ({ fontWeight: theme.typography.weight.bold }));

const Meta = styled.div(({ theme }) => ({ color: theme.textMutedColor, fontSize: theme.typography.size.s1 }));

const Note = styled.p(({ theme }) => ({ color: theme.textMutedColor, fontSize: theme.typography.size.s1, marginTop: 12 }));

const Message = styled.p(({ theme }) => ({ padding: '12px 16px', margin: 0, color: theme.textMutedColor }));

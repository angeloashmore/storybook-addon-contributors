import React, { useState } from 'react';
import { AddonPanel } from 'storybook/internal/components';
import { addons, types, useStorybookState } from 'storybook/manager-api';
import { styled } from 'storybook/theming';

import type { Contributor, ContributorsData } from './preset';

addons.register('component-contributors', () => {
  addons.add('component-contributors/panel', {
    type: types.PANEL,
    title: 'Contributors',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <Panel />
      </AddonPanel>
    ),
  });
});

function Panel() {
  const { storyId, index } = useStorybookState();
  const data: ContributorsData | undefined = (window as any).__COMPONENT_CONTRIBUTORS__;
  const story = index?.[storyId] as { importPath?: string; title: string } | undefined;
  const people = data?.components[story?.importPath!]?.contributors;
  if (!data || !people?.length) return <Muted>No git history was found for this component.</Muted>;

  return (
    <div style={{ padding: '12px 16px' }}>
      <strong>People who have worked on {story!.title.split('/').pop()}</strong>
      <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
        {people.map((p) => (
          <Row key={p.gravatarHash}>
            <Avatar person={p} />
            <div>
              <strong data-testid="contributor-name">{p.name}</strong>
              <Muted as="div">
                Worked on this in {p.commits} {p.commits === 1 ? 'commit' : 'commits'} · last active{' '}
                <time dateTime={p.lastActive} title={new Date(p.lastActive).toDateString()}>
                  {timeAgo(p.lastActive)}
                </time>
              </Muted>
            </div>
          </Row>
        ))}
      </ul>
      <Muted>
        From git history as of {new Date(data.generatedAt).toDateString()}. Recent work counts more: a change's weight
        halves every {data.halfLifeDays} days.
      </Muted>
    </div>
  );
}

function Avatar({ person }: { person: Contributor }) {
  const [failed, setFailed] = useState(false);
  const style = { width: 40, height: 40, borderRadius: '50%', flexShrink: 0 };
  if (failed) {
    return <Initials style={style}>{person.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</Initials>;
  }
  const src = `https://www.gravatar.com/avatar/${person.gravatarHash}?s=80&d=identicon`;
  return <img src={src} alt="" style={style} onError={() => setFailed(true)} />;
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 36.5) / 10} years ago`;
}

const Muted = styled.p(({ theme }) => ({ color: theme.textMutedColor, fontSize: theme.typography.size.s1, margin: 0 }));
const Row = styled.li(({ theme }) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${theme.appBorderColor}` }));
const Initials = styled.span(({ theme }) => ({ display: 'grid', placeItems: 'center', fontWeight: 'bold', background: theme.background.hoverable }));

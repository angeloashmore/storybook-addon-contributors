// Shapes shared by the Node collector and the manager panel.
// Nothing here may contain an email address.

export interface Contributor {
  name: string;
  /** SHA-256 of the trimmed, lowercased email, for Gravatar. */
  gravatarHash: string;
  commits: number;
  /** Recency-weighted score: sum of 0.5^(ageDays / halfLifeDays) per commit. */
  score: number;
  /** ISO date of the person's most recent commit to the component. */
  lastActive: string;
}

export interface ComponentContributors {
  title: string;
  /** Files or folders (relative to Storybook's working dir) treated as the component. */
  files: string[];
  contributors: Contributor[];
}

export interface ContributorsData {
  generatedAt: string;
  halfLifeDays: number;
  /** Keyed by the story file's importPath from the story index. */
  components: Record<string, ComponentContributors>;
}

export interface AddonOptions {
  /** A commit's weight halves every N days. Default 182 (~6 months). */
  halfLifeDays?: number;
  /** Max people listed per component. Default 10. */
  limit?: number;
}

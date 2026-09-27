import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../fixture/src/**/*.stories.tsx"],
  addons: ["storybook-addon-contributors"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
};

export default config;

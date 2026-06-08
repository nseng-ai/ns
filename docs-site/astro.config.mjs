import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const site = process.env.DOCS_SITE_URL ?? 'https://asdl-docs.vercel.app';

export default defineConfig({
  output: 'static',
  site,
  integrations: [
    starlight({
      title: 'asdl',
      description:
        'Agent-native software development tooling for durable plans, branch memory, review workflows, and retrospectives.',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'asdl',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/dagster-io/asdl-tools',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/dagster-io/asdl-tools/edit/master/docs-site/',
      },
      customCss: ['./src/styles/theme.css'],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: {
          borderRadius: '0.5rem',
          borderColor: 'var(--sl-color-hairline)',
          codeFontFamily: 'var(--sl-font-mono)',
          frames: { shadowColor: 'transparent' },
        },
      },
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        Header: './src/components/Header.astro',
        Hero: './src/components/Hero.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
      },
      plugins: [
        starlightLlmsTxt({
          projectName: 'asdl',
          description:
            'asdl is a suite of agent-native development tools for preserving branch context, coordinating objectives, and automating review workflows.',
          details:
            'The docs portal publishes the same Markdown corpus that agents consume, so human-facing docs and llms.txt bundles stay aligned.',
          customSets: [
            {
              label: 'Concepts',
              paths: ['concepts/**'],
              description: 'Core asdl concepts and operating models.',
            },
            {
              label: 'Tools',
              paths: ['tools/**'],
              description: 'Command-line tools and workflows in the asdl toolkit.',
            },
            {
              label: 'Skills',
              paths: ['skills/**'],
              description: 'Public agent skills that build on asdl tools.',
            },
          ],
        }),
      ],
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Quickstart', slug: 'start/quickstart' },
            { label: 'Installation', slug: 'start/installation' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'The asdl umbrella', slug: 'concepts/umbrella' },
            { label: 'CLI conventions', slug: 'concepts/conventions' },
            { label: 'Objectives', slug: 'concepts/objectives' },
          ],
        },
        {
          label: 'Tools',
          items: [
            { label: 'slot — parallel worktrees', slug: 'tools/slot' },
            { label: 'brmem — branch memory', slug: 'tools/brmem' },
            { label: 'pr-address — review replies', slug: 'tools/pr-address' },
            { label: 'aretro — retrospectives', slug: 'tools/aretro' },
            { label: 'objective — durable plans', slug: 'tools/objective' },
            { label: 'roaster — CI PR-diff findings', slug: 'tools/roaster' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Parallel branches with slot', slug: 'guides/parallel-branches' },
            { label: 'Context across sessions', slug: 'guides/context-across-sessions' },
            { label: 'Addressing PR feedback', slug: 'guides/addressing-pr-feedback' },
          ],
        },
        {
          label: 'Skills',
          items: [
            { label: 'What are skills?', slug: 'skills' },
            { label: 'brmem', slug: 'skills/brmem' },
            { label: 'pr-address', slug: 'skills/pr-address' },
            { label: 'branch-retro', slug: 'skills/branch-retro' },
            { label: 'objective', slug: 'skills/objective' },
          ],
        },
      ],
    }),
  ],
});

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
      editLink: {
        baseUrl: 'https://github.com/dagster-io/asdl-tools/edit/master/docs-site/',
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
          label: 'Start',
          items: [{ label: 'Docs overview', slug: 'docs' }],
        },
        {
          label: 'Concepts',
          items: [{ label: 'Objectives', slug: 'concepts/objectives' }],
        },
        {
          label: 'Tools',
          items: [{ label: 'Branch Memory', slug: 'tools/brmem' }],
        },
        {
          label: 'Skills',
          items: [{ label: 'Branch retrospective', slug: 'skills/branch-retro' }],
        },
      ],
    }),
  ],
});

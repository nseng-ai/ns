// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
} & {
  DocData: {
    docs: {
      /**
       * Last modified date of document file, obtained from version control.
       *
       */
      lastModified?: Date;
    },
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"introduction.mdx": () => import("../docs/introduction.mdx?collection=docs"), "concepts/cli-conventions.mdx": () => import("../docs/concepts/cli-conventions.mdx?collection=docs"), "concepts/ns-umbrella.mdx": () => import("../docs/concepts/ns-umbrella.mdx?collection=docs"), "concepts/objectives.mdx": () => import("../docs/concepts/objectives.mdx?collection=docs"), "get-started/installation.mdx": () => import("../docs/get-started/installation.mdx?collection=docs"), "get-started/quickstart.mdx": () => import("../docs/get-started/quickstart.mdx?collection=docs"), "guides/addressing-pr-feedback.mdx": () => import("../docs/guides/addressing-pr-feedback.mdx?collection=docs"), "guides/context-across-sessions.mdx": () => import("../docs/guides/context-across-sessions.mdx?collection=docs"), "guides/parallel-branches.mdx": () => import("../docs/guides/parallel-branches.mdx?collection=docs"), "skills/branch-retro.mdx": () => import("../docs/skills/branch-retro.mdx?collection=docs"), "skills/brmem.mdx": () => import("../docs/skills/brmem.mdx?collection=docs"), "skills/index.mdx": () => import("../docs/skills/index.mdx?collection=docs"), "skills/objective.mdx": () => import("../docs/skills/objective.mdx?collection=docs"), "skills/pr-address.mdx": () => import("../docs/skills/pr-address.mdx?collection=docs"), "tools/brmem.mdx": () => import("../docs/tools/brmem.mdx?collection=docs"), "tools/objective.mdx": () => import("../docs/tools/objective.mdx?collection=docs"), "tools/pr-address.mdx": () => import("../docs/tools/pr-address.mdx?collection=docs"), "tools/retro.mdx": () => import("../docs/tools/retro.mdx?collection=docs"), "tools/reviews.mdx": () => import("../docs/tools/reviews.mdx?collection=docs"), "tools/slot.mdx": () => import("../docs/tools/slot.mdx?collection=docs"), }),
};
export default browserCollections;
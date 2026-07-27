// @ts-nocheck
import * as __fd_glob_25 from "../docs/tools/slot.mdx?collection=docs"
import * as __fd_glob_24 from "../docs/tools/reviews.mdx?collection=docs"
import * as __fd_glob_23 from "../docs/tools/retro.mdx?collection=docs"
import * as __fd_glob_22 from "../docs/tools/pr-address.mdx?collection=docs"
import * as __fd_glob_21 from "../docs/tools/objective.mdx?collection=docs"
import * as __fd_glob_20 from "../docs/tools/brmem.mdx?collection=docs"
import * as __fd_glob_19 from "../docs/skills/pr-address.mdx?collection=docs"
import * as __fd_glob_18 from "../docs/skills/objective.mdx?collection=docs"
import * as __fd_glob_17 from "../docs/skills/index.mdx?collection=docs"
import * as __fd_glob_16 from "../docs/skills/brmem.mdx?collection=docs"
import * as __fd_glob_15 from "../docs/skills/branch-retro.mdx?collection=docs"
import * as __fd_glob_14 from "../docs/guides/parallel-branches.mdx?collection=docs"
import * as __fd_glob_13 from "../docs/guides/context-across-sessions.mdx?collection=docs"
import * as __fd_glob_12 from "../docs/guides/addressing-pr-feedback.mdx?collection=docs"
import * as __fd_glob_11 from "../docs/get-started/quickstart.mdx?collection=docs"
import * as __fd_glob_10 from "../docs/get-started/installation.mdx?collection=docs"
import * as __fd_glob_9 from "../docs/concepts/objectives.mdx?collection=docs"
import * as __fd_glob_8 from "../docs/concepts/ns-umbrella.mdx?collection=docs"
import * as __fd_glob_7 from "../docs/concepts/cli-conventions.mdx?collection=docs"
import * as __fd_glob_6 from "../docs/introduction.mdx?collection=docs"
import { default as __fd_glob_5 } from "../docs/tools/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../docs/skills/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../docs/guides/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../docs/get-started/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../docs/concepts/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
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
}>({"doc":{"passthroughs":["extractedReferences","lastModified"]}});

export const docs = await create.docs("docs", "docs", {"meta.json": __fd_glob_0, "concepts/meta.json": __fd_glob_1, "get-started/meta.json": __fd_glob_2, "guides/meta.json": __fd_glob_3, "skills/meta.json": __fd_glob_4, "tools/meta.json": __fd_glob_5, }, {"introduction.mdx": __fd_glob_6, "concepts/cli-conventions.mdx": __fd_glob_7, "concepts/ns-umbrella.mdx": __fd_glob_8, "concepts/objectives.mdx": __fd_glob_9, "get-started/installation.mdx": __fd_glob_10, "get-started/quickstart.mdx": __fd_glob_11, "guides/addressing-pr-feedback.mdx": __fd_glob_12, "guides/context-across-sessions.mdx": __fd_glob_13, "guides/parallel-branches.mdx": __fd_glob_14, "skills/branch-retro.mdx": __fd_glob_15, "skills/brmem.mdx": __fd_glob_16, "skills/index.mdx": __fd_glob_17, "skills/objective.mdx": __fd_glob_18, "skills/pr-address.mdx": __fd_glob_19, "tools/brmem.mdx": __fd_glob_20, "tools/objective.mdx": __fd_glob_21, "tools/pr-address.mdx": __fd_glob_22, "tools/retro.mdx": __fd_glob_23, "tools/reviews.mdx": __fd_glob_24, "tools/slot.mdx": __fd_glob_25, });
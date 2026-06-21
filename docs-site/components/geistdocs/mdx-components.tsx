import { createMdxComponents } from "@vercel/geistdocs/mdx";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Step, Steps } from "fumadocs-ui/components/steps";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";

const localComponents: MDXComponents = {
  a: ({ href, ...props }) =>
    typeof href === "string" && href.startsWith("/") ? (
      <Link className="font-normal text-primary no-underline" href={href} {...props} />
    ) : (
      <a className="font-normal text-primary no-underline" href={href} {...props} />
    ),
  File,
  Files,
  Folder,
  Step,
  Steps,
};

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return createMdxComponents({
    ...localComponents,
    ...components,
  });
}

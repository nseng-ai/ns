import { docsLabel } from "@/lib/geistdocs/site-identity";

export const github = {
  owner: "nseng-ai",
  repo: "ns",
};

export const nav = [
  {
    label: docsLabel,
    href: "/docs",
  },
  {
    label: "Extensions",
    href: "/extensions",
  },
  {
    label: "GitHub",
    href: `https://github.com/${github.owner}/${github.repo}/`,
  },
];

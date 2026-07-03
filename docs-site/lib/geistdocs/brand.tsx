import { logoBadgeLabel, productName } from "@/lib/geistdocs/site-identity";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold text-gray-1000 text-lg leading-none">{productName}</span>
      <span className="rounded-full border border-blue-300 px-2 py-0.5 font-medium text-blue-700 text-xs leading-none">
        {logoBadgeLabel}
      </span>
    </span>
  );
}

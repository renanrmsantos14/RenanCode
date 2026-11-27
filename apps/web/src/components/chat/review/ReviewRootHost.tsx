import { useEffect } from "react";

import { ReviewViewer } from "./ReviewViewer";
import { useReviewMode } from "./useReviewMode";

const NO_ENTRIES: never[] = [];
const SOURCE = { cwd: undefined, hostImageUrl: null, threadRef: null };

/** Review for media opened outside a thread (pull requests, issues, workflows): full screen. */
export function ReviewRootHost({ pathname }: { readonly pathname: string }) {
  const review = useReviewMode(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync, react/exhaustive-effect-dependencies -- leaving the page ends a review that belongs to it; the router is external
  useEffect(() => review.close, [pathname, review.close]);
  if (!review.active) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-black">
      <ReviewViewer review={review} scope={null} entries={NO_ENTRIES} source={SOURCE} standalone />
    </div>
  );
}

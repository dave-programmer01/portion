import { router, type Href } from "expo-router";

/**
 * Back navigation that never throws the dev-only `GO_BACK was not handled`
 * error. A screen can be entered with no history (deep link, notification,
 * a Redirect that replaced the stack), in which case `router.back()` has
 * nothing to pop — so we fall back to replacing with a safe route.
 */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

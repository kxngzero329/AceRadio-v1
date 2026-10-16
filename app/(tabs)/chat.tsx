import { Redirect } from "expo-router";

/** Chat is a tab-bar action; direct links safely fall back to Home. */
export default function ChatRoute() {
  return <Redirect href="/" />;
}

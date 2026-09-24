import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing-story";

export const metadata: Metadata = {
  title: { absolute: "Nook · Chat for clubs, in your club’s colours" },
  description:
    "Nook is chat for clubs and communities: channels, threads and DMs, where every nook wears its own colours. Try the demo in one click.",
};

export default function Home() {
  return <Landing />;
}

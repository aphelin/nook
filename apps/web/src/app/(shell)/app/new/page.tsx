import type { Metadata } from "next";
import { CreateNookFlow } from "./create-nook-flow";

export const metadata: Metadata = { title: "Start a nook" };

export default function NewNookPage() {
  return <CreateNookFlow />;
}

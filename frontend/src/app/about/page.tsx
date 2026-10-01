import { AboutView } from "@/components/about/AboutView";

export const metadata = {
  title: "About AgentShield | Runtime AI Agent Security Firewall",
  description:
    "AgentShield provides runtime perimeter security for AI agents, detecting prompt injections, assessing CVSS action risks, and preventing unauthorized tool execution.",
};

export default function AboutPage() {
  return <AboutView />;
}

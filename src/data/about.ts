import type { ImageSourcePropType } from "react-native";

/** Static station story and bundled portraits. Available before any content request. */
export const ABOUT = {
  intro: "It's a vision brought to life.",
  visionTitle: "Radio. Reimagined.",
  visionBody: "Built from the ground up by a driven team, AceRadio aims to reimagine what radio can be in the digital age.",
  locationDetail: "Broadcasting from Century City, South Africa",
  footer: "AceRadio • Built for those who listen differently.",
  founders: [
    { id: "luke-henwood", name: "Luke Henwood", role: "CO-FOUNDER", photo: require("../../assets/founder-profiles/luke.png") as ImageSourcePropType },
    { id: "christopher-marshall", name: "Christopher Marshall", role: "CO-FOUNDER", photo: require("../../assets/founder-profiles/christopher.png") as ImageSourcePropType },
  ],
  milestones: [
    { id: "idea", date: "July 2025", description: "The idea was born." },
    { id: "concept", date: "60 days later", description: "From concept to build." },
    { id: "launch", date: "3 October 2025", description: "AceRadio officially launched." },
  ],
} as const;

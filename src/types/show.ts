import type { ImageSourcePropType } from "react-native";
export type Show = {
  id: string;
  title: string;
  presenter: string;
  subtitle: string;
  schedule: string;
  day: string;
  detail: string;
  image?: ImageSourcePropType;
  poster?: ImageSourcePropType;
  accent: string;
  listeners?: number;
};

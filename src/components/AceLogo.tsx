import Logo from "../../assets/branding/ace-radio-logo.svg";

type AceLogoProps = { small?: boolean; width?: number };

export function AceLogo({
  small = false,
  width = small ? 86 : 200,
}: AceLogoProps) {
  return (
    <Logo
      width={width}
      height={width * (250 / 393)}
      preserveAspectRatio="xMidYMid meet"
      accessibilityRole="image"
      accessibilityLabel="AceRadio"
    />
  );
}

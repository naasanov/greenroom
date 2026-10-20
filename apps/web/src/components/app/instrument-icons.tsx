import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SaxophoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5 10.5 5.5v11a3.5 3.5 0 0 0 7 0V12" />
      <path d="M14.5 8h6M15 8l1.2 4M20 8l-1.2 4" />
      <circle cx="10.5" cy="9" r="1" />
      <circle cx="10.5" cy="12.5" r="1" />
    </Svg>
  );
}

export function TrumpetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 10h13" />
      <path d="M15 10 21 6.5v11L15 14" />
      <path d="M15 14H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 10V6.5M10.5 10V6.5M13 10V6.5M7 6.5h2M9.5 6.5h2M12 6.5h2" />
    </Svg>
  );
}

export function ViolinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="3.2" r="1.2" />
      <path d="M12 4.4v5.1" />
      <path d="M12 9.5c2.5 0 4 1 4 2.8 0 1.3-1.5 1.7-1.5 2.5 0 .8 2 1.2 2 3.2 0 2.2-2 3.5-4.5 3.5s-4.5-1.3-4.5-3.5c0-2 2-2.4 2-3.2 0-.8-1.5-1.2-1.5-2.5 0-1.8 1.5-2.8 4-2.8Z" />
      <path d="M10.2 17.5v1.5M13.8 17.5v1.5" />
    </Svg>
  );
}
